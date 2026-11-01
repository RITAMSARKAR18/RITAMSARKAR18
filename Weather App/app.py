import os
import re
import time
import requests
import pandas as pd
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from google import genai
from google.genai import types

load_dotenv(override=True)

# Optional: Paste a real 39-character Google AI Studio key here, or leave as-is to use the built-in AI engine
DIRECT_API_KEY = ""

app = Flask(__name__)
http_session = requests.Session()

WEATHER_CACHE = {}
CACHE_TTL = 600

WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 80: "Rain showers",
    81: "Moderate rain showers", 82: "Violent rain showers", 95: "Thunderstorm"
}

def train_ml_predictor(lat: float, lon: float) -> dict:
    """Fetches 60-day history and trains a Random Forest model to predict tomorrow's temp."""
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "past_days": 60,
        "forecast_days": 1,
        "daily": ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "wind_speed_10m_max"],
        "timezone": "auto"
    }
    res = http_session.get(url, params=params, timeout=10)
    res.raise_for_status()
    daily = res.json().get("daily", {})

    df = pd.DataFrame({
        "max_temp": daily.get("temperature_2m_max", []),
        "min_temp": daily.get("temperature_2m_min", []),
        "precip": daily.get("precipitation_sum", []),
        "wind_max": daily.get("wind_speed_10m_max", [])
    }).dropna().reset_index(drop=True)

    df["lag_1_max"] = df["max_temp"].shift(1)
    df["lag_2_max"] = df["max_temp"].shift(2)
    df["lag_1_min"] = df["min_temp"].shift(1)
    df["rolling_3_max"] = df["max_temp"].rolling(window=3).mean()
    df["target_max"] = df["max_temp"].shift(-1)
    df["target_min"] = df["min_temp"].shift(-1)

    features = ["max_temp", "min_temp", "precip", "wind_max", "lag_1_max", "lag_2_max", "lag_1_min", "rolling_3_max"]
    train_df = df.dropna(subset=features + ["target_max", "target_min"])

    if len(train_df) < 15:
        return {"error": "Not enough historical data"}

    X = train_df[features]
    y_max = train_df["target_max"]
    y_min = train_df["target_min"]

    split = len(train_df) - 7
    model_max = RandomForestRegressor(n_estimators=50, n_jobs=-1, random_state=42)
    model_min = RandomForestRegressor(n_estimators=50, n_jobs=-1, random_state=42)

    model_max.fit(X.iloc[:split], y_max.iloc[:split])
    mae = mean_absolute_error(y_max.iloc[split:], model_max.predict(X.iloc[split:]))

    model_max.fit(X, y_max)
    model_min.fit(X, y_min)

    latest = df.dropna(subset=features)[features].iloc[[-1]]
    return {
        "predicted_max_c": round(float(model_max.predict(latest)[0]), 1),
        "predicted_min_c": round(float(model_min.predict(latest)[0]), 1),
        "mae_c": round(float(mae), 2)
    }

def get_city_weather_bundle(city_name: str) -> dict:
    """Fetches live weather, 7-day forecast, and ML prediction for a city with caching.
    
    Args:
        city_name: Name of the city (e.g., 'Kolkata', 'London', 'Tokyo').
    """
    key = city_name.strip().lower()
    now = time.time()

    if key in WEATHER_CACHE and (now - WEATHER_CACHE[key]["timestamp"] < CACHE_TTL):
        return WEATHER_CACHE[key]["data"]

    geo_url = "https://geocoding-api.open-meteo.com/v1/search"
    geo_res = http_session.get(geo_url, params={"name": city_name, "count": 1, "language": "en"}, timeout=10)
    geo_data = geo_res.json()
    if not geo_data.get("results"):
        return {"error": f"City '{city_name}' not found."}

    loc = geo_data["results"][0]
    lat, lon = loc["latitude"], loc["longitude"]

    w_url = "https://api.open-meteo.com/v1/forecast"
    w_params = {
        "latitude": lat,
        "longitude": lon,
        "current": ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "weather_code", "wind_speed_10m"],
        "daily": ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_probability_max"],
        "timezone": "auto"
    }
    w_data = http_session.get(w_url, params=w_params, timeout=10).json()
    curr = w_data.get("current", {})
    daily = w_data.get("daily", {})

    forecast_days = []
    for i in range(len(daily.get("time", []))):
        forecast_days.append({
            "date": daily["time"][i],
            "condition": WMO_CODES.get(daily["weather_code"][i], "Variable"),
            "max_temp": daily["temperature_2m_max"][i],
            "min_temp": daily["temperature_2m_min"][i],
            "rain_prob": daily["precipitation_probability_max"][i]
        })

    ml_data = train_ml_predictor(lat, lon)

    bundle = {
        "city": loc["name"],
        "country": loc.get("country", ""),
        "current": {
            "temp": curr.get("temperature_2m"),
            "feels_like": curr.get("apparent_temperature"),
            "humidity": curr.get("relative_humidity_2m"),
            "wind": curr.get("wind_speed_10m"),
            "condition": WMO_CODES.get(curr.get("weather_code"), "Variable")
        },
        "ml_prediction": ml_data,
        "forecast": forecast_days
    }

    WEATHER_CACHE[key] = {"timestamp": now, "data": bundle}
    return bundle

def extract_city_from_text(text: str) -> str:
    """Extracts a city name from natural language questions."""
    patterns = [
        r"(?:in|for|at|to|visit|visiting|about)\s+([a-zA-Z\s]{2,25})",
        r"^([a-zA-Z\s]{2,20})\s+(?:weather|forecast|temperature|rain|prediction)"
    ]
    stop_words = {
        "today", "tomorrow", "this", "weekend", "week", "now", "right",
        "the", "morning", "evening", "night", "next", "weather", "forecast", "ml"
    }
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            words = [w for w in match.group(1).strip().split() if w.lower() not in stop_words]
            if words:
                return " ".join(words)
    cleaned = re.sub(r"[^a-zA-Z\s]", "", text).strip()
    if 1 <= len(cleaned.split()) <= 2 and cleaned.lower() not in {"hi", "hello", "hey", "help", "thanks"}:
        return cleaned
    return "Kolkata"

def generate_smart_local_reply(user_message: str) -> str:
    """Built-in AI Meteorologist that works without an external API key."""
    msg_lower = user_message.lower()
    if msg_lower in {"hi", "hello", "hey"}:
        return (
            "Hello! I am your AI Meteorologist. Ask me about the current weather, "
            "7-day rain outlook, or our Random Forest ML temperature prediction for any city "
            "(for example: 'Will it rain in Mumbai this week?' or 'Weather in London')."
        )

    city = extract_city_from_text(user_message)
    data = get_city_weather_bundle(city)
    if "error" in data:
        return f"I couldn't find weather data for '{city}'. Try asking with a city name like 'Weather in Delhi' or 'Forecast for Tokyo'."

    curr = data["current"]
    ml = data["ml_prediction"]
    forecast = data["forecast"]
    tomorrow = forecast[1] if len(forecast) > 1 else forecast[0]
    rainy_days = [d for d in forecast if d["rain_prob"] >= 50]

    lines = [
        f"📍 **{data['city']}, {data['country']} — Live Weather Analysis**",
        f"• **Current:** {curr['condition']}, {curr['temp']} °C (Feels like {curr['feels_like']} °C), Humidity {curr['humidity']}%, Wind {curr['wind']} km/h."
    ]

    if "error" not in ml:
        lines.append(
            f"• **Random Forest ML Prediction (Tomorrow):** High of {ml['predicted_max_c']} °C / "
            f"Low of {ml['predicted_min_c']} °C (±{ml['mae_c']} °C error), compared to the meteorological forecast of "
            f"{tomorrow['max_temp']} °C / {tomorrow['min_temp']} °C ({tomorrow['condition']})."
        )

    if rainy_days:
        rain_str = ", ".join([f"{d['date']} ({d['rain_prob']}%)" for d in rainy_days[:3]])
        lines.append(f"• **Rain Alert:** High chance of rain on {rain_str}. Carry an umbrella!")
    else:
        max_rain = max(d["rain_prob"] for d in forecast)
        lines.append(f"• **7-Day Rain Outlook:** Low precipitation risk this week (peak chance: {max_rain}%). Great conditions for outdoor plans!")

    if curr["temp"] >= 32:
        lines.append("💡 **Advice:** It is quite hot—stay hydrated and wear breathable clothes.")
    elif curr["temp"] <= 15:
        lines.append("💡 **Advice:** Cool temperatures expected—pack a light jacket or sweater.")

    return "\n".join(lines)

def is_valid_gemini_key(key: str) -> bool:
    """Checks if the key is a genuine 39-character Google AI Studio key and not a placeholder."""
    placeholders = {"AIzaSyYourRealKeyHere", "AIzaSyYourActualKeyHere", "your_actual_api_key_here"}
    return bool(key and key.startswith("AIza") and len(key) >= 38 and key not in placeholders and "Your" not in key)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/weather")
def api_weather():
    city = request.args.get("city", "Kolkata")
    try:
        data = get_city_weather_bundle(city)
        if "error" in data:
            return jsonify(data), 404
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/chat", methods=["POST"])
def api_chat():
    body = request.get_json() or {}
    user_message = body.get("message", "").strip()
    history = body.get("history", [])

    api_key = DIRECT_API_KEY.strip().strip('"').strip("'")
    if not is_valid_gemini_key(api_key):
        api_key = os.environ.get("GEMINI_API_KEY", "").strip().strip('"').strip("'")

    # Clear environment variables so invalid .env keys don't get auto-loaded by the SDK
    os.environ.pop("GOOGLE_API_KEY", None)
    os.environ.pop("GEMINI_API_KEY", None)

    if is_valid_gemini_key(api_key):
        try:
            client = genai.Client(api_key=api_key)
            convo_lines = [f"{m['role'].upper()}: {m['content']}" for m in history[-6:]]
            convo_lines.append(f"USER: {user_message}")

            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents="\n".join(convo_lines),
                config=types.GenerateContentConfig(
                    system_instruction=(
                        "You are an expert AI Meteorologist. Use the `get_city_weather_bundle` tool "
                        "whenever a user asks about weather, forecasts, or ML predictions for any city. "
                        "Keep answers concise, friendly, and practical."
                    ),
                    tools=[get_city_weather_bundle],
                    temperature=0.3
                )
            )
            return jsonify({"reply": response.text})
        except Exception:
            # If the key is rejected by Google, seamlessly use the built-in AI Meteorologist
            pass

    try:
        reply = generate_smart_local_reply(user_message)
        return jsonify({"reply": reply})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    print("Starting Weather App server at http://127.0.0.1:5000 ...")
    app.run(debug=True, port=5000)