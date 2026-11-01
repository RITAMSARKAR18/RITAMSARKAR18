const searchForm = document.getElementById("search-form");
const cityInput = document.getElementById("city-input");
const weatherLoading = document.getElementById("weather-loading");
const weatherError = document.getElementById("weather-error");
const weatherContent = document.getElementById("weather-content");

const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatBox = document.getElementById("chat-box");
const chatSendBtn = document.getElementById("chat-send-btn");

let chatHistory = [];

async function loadWeather(city) {
    weatherLoading.classList.remove("hidden");
    weatherError.classList.add("hidden");
    weatherContent.classList.add("hidden");

    try {
        const res = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
        const data = await res.json();

        if (!res.ok || data.error) {
            throw new Error(data.error || "Failed to load weather data");
        }

        document.getElementById("loc-name").textContent = `${data.city}, ${data.country}`;
        document.getElementById("loc-condition").textContent = data.current.condition;
        document.getElementById("curr-temp").textContent = `${data.current.temp} °C`;
        document.getElementById("curr-feels").textContent = `Feels like ${data.current.feels_like} °C`;
        document.getElementById("curr-humidity").textContent = `${data.current.humidity}%`;
        document.getElementById("curr-wind").textContent = `${data.current.wind} km/h`;

        if (data.ml_prediction && !data.ml_prediction.error) {
            document.getElementById("ml-text").textContent =
                `Predicted High: ${data.ml_prediction.predicted_max_c} °C | ` +
                `Predicted Low: ${data.ml_prediction.predicted_min_c} °C ` +
                `(Validation Error: ±${data.ml_prediction.mae_c} °C)`;
        } else {
            document.getElementById("ml-text").textContent = "ML prediction unavailable.";
        }

        const tbody = document.getElementById("forecast-body");
        tbody.innerHTML = "";
        data.forecast.forEach(day => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${day.date}</td>
                <td>${day.condition}</td>
                <td>${day.max_temp} °C</td>
                <td>${day.min_temp} °C</td>
                <td>${day.rain_prob}%</td>
            `;
            tbody.appendChild(tr);
        });

        weatherContent.classList.remove("hidden");
    } catch (err) {
        weatherError.textContent = err.message;
        weatherError.classList.remove("hidden");
    } finally {
        weatherLoading.classList.add("hidden");
    }
}

function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = `message ${role}`;
    div.textContent = text;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
    return div;
}

searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const city = cityInput.value.trim();
    if (city) loadWeather(city);
});

chatForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const message = chatInput.value.trim();
    if (!message) return;

    appendMessage("user", message);
    chatInput.value = "";
    chatSendBtn.disabled = true;

    const thinkingBubble = appendMessage("assistant", "Thinking & checking live weather...");

    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, history: chatHistory })
        });
        const data = await res.json();

        if (!res.ok || data.error) {
            thinkingBubble.textContent = `Error: ${data.error || "Failed to get AI reply."}`;
        } else {
            thinkingBubble.textContent = data.reply;
            chatHistory.push({ role: "user", content: message });
            chatHistory.push({ role: "assistant", content: data.reply });
        }
    } catch (err) {
        thinkingBubble.textContent = `Network Error: ${err.message}`;
    } finally {
        chatSendBtn.disabled = false;
    }
});

// Load default city on startup
loadWeather(cityInput.value);