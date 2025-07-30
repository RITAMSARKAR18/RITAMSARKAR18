// --- Global Variables ---
let cart = []; // Stores items in the shopping cart: [{ name, price, quantity }]
let orders = []; // Stores completed orders: [{ orderId, items, total, date }]

// --- DOM Elements ---
const cartIconButton = document.getElementById('cart-icon-button');
const cartCountSpan = document.getElementById('cart-count');
const shoppingCartModal = document.getElementById('shopping-cart-modal');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartTotalSpan = document.getElementById('cart-total');
const buyAllItemsBtn = document.getElementById('buy-all-items-btn');
const orderConfirmationModal = document.getElementById('order-confirmation-modal');
const orderConfirmationMessage = orderConfirmationModal.querySelector('p'); // Get the paragraph for message

// New Order Tracker DOM Elements
const orderTrackerLink = document.getElementById('order-tracker-link');
const orderTrackerModal = document.getElementById('order-tracker-modal');
const orderNumberInput = document.getElementById('order-number-input');
const trackOrderBtn = document.getElementById('track-order-btn');
const orderStatusDisplay = document.getElementById('order-status-display');


// --- Helper Functions ---

/**
 * Updates the number displayed on the shopping bag icon.
 */
function updateCartCount() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCountSpan.textContent = totalItems;
  cartCountSpan.style.display = totalItems > 0 ? 'block' : 'none'; // Show/hide badge
}

/**
 * Renders the items currently in the cart into the shopping cart modal.
 * Calculates and displays the total price.
 */
function updateCartDisplay() {
  cartItemsContainer.innerHTML = ''; // Clear existing items

  if (cart.length === 0) {
    cartItemsContainer.innerHTML = '<p class="empty-cart-message">Your cart is empty.</p>';
    cartTotalSpan.textContent = '₹0';
    buyAllItemsBtn.disabled = true; // Disable buy button if cart is empty
    return;
  }

  let total = 0;
  cart.forEach((item, index) => {
    const itemElement = document.createElement('div');
    itemElement.classList.add('cart-item');
    itemElement.innerHTML = `
      <div class="cart-item-info">
        <p class="item-name">${item.name}</p>
        <p class="item-price">₹${item.price.toLocaleString('en-IN')}</p>
      </div>
      <div class="cart-item-controls">
        <button class="decrease-quantity-btn" data-index="${index}">-</button>
        <span class="quantity-display">${item.quantity}</span>
        <button class="increase-quantity-btn" data-index="${index}">+</button>
        <button class="remove-item-btn" data-index="${index}">Remove</button>
      </div>
    `;
    cartItemsContainer.appendChild(itemElement);
    total += item.price * item.quantity;
  });

  cartTotalSpan.textContent = `₹${total.toLocaleString('en-IN')}`;
  buyAllItemsBtn.disabled = false; // Enable buy button if cart has items
  updateCartCount(); // Update the icon badge
}

/**
 * Adds a product to the cart or increments its quantity if it already exists.
 * @param {string} name - The name of the product.
 * @param {number} price - The price of the product.
 */
function addItemToCart(name, price) {
  const existingItemIndex = cart.findIndex(item => item.name === name);

  if (existingItemIndex > -1) {
    cart[existingItemIndex].quantity++;
  } else {
    cart.push({ name, price, quantity: 1 });
  }
  updateCartDisplay();
  console.log(`Added "${name}" to cart. Current cart:`, cart);
}

/**
 * Opens the specified modal.
 * @param {HTMLElement} modalElement - The modal DOM element to open.
 */
function openModal(modalElement) {
  modalElement.style.display = 'flex'; // Use flex to center content
}

/**
 * Closes the specified modal.
 * @param {HTMLElement} modalElement - The modal DOM element to close.
 */
function closeModal(modalElement) {
  modalElement.style.display = 'none';
}

/**
 * Shows the order confirmation modal and hides it after a delay.
 * @param {string} orderId - The ID of the confirmed order.
 */
function showOrderConfirmation(orderId) {
  orderConfirmationMessage.innerHTML = `Your order has been placed successfully! Your Order Number is: <strong>${orderId}</strong>.`;
  openModal(orderConfirmationModal);
  setTimeout(() => {
    closeModal(orderConfirmationModal);
  }, 5000); // Keep open a bit longer to see order number
}

/**
 * Simulates order tracking based on a provided order number.
 * In a real application, this would involve an API call to a backend.
 * @param {string} orderNumber - The order number to track.
 */
function trackOrder(orderNumber) {
  orderStatusDisplay.classList.remove('success', 'error');
  orderStatusDisplay.textContent = 'Tracking your order...';

  // Find the order in our stored orders
  const foundOrder = orders.find(order => order.orderId === orderNumber);

  // Simulate an API call delay
  setTimeout(() => {
    if (foundOrder) {
      let itemsList = foundOrder.items.map(item => `${item.name} (x${item.quantity})`).join(', ');
      orderStatusDisplay.innerHTML = `
        <p><strong>Order ${foundOrder.orderId} Details:</strong></p>
        <p>Date: ${foundOrder.date}</p>
        <p>Items: ${itemsList}</p>
        <p>Total: ₹${foundOrder.total.toLocaleString('en-IN')}</p>
        <p>Status: Shipped! Expected delivery: 3-5 business days.</p>
      `;
      orderStatusDisplay.classList.add('success');
    } else {
      orderStatusDisplay.textContent = `Order ${orderNumber}: Not Found. Please check the number and try again.`;
      orderStatusDisplay.classList.add('error');
    }
  }, 1500); // Simulate 1.5 second loading time
}


// --- Event Handlers ---

/**
 * Handles clicks on "Add to Cart" buttons.
 */
function handleAddToCartClick(event) {
  const productName = event.target.dataset.productName;
  const productPrice = parseFloat(event.target.dataset.productPrice);
  addItemToCart(productName, productPrice);
  console.log(`"${productName}" added to cart.`);
}

/**
 * Handles clicks on "Buy Now" buttons.
 * Adds the item to cart and immediately opens the cart modal.
 */
function handleBuyNowClick(event) {
  const productName = event.target.dataset.productName;
  const productPrice = parseFloat(event.target.dataset.productPrice);
  addItemToCart(productName, productPrice);
  openModal(shoppingCartModal);
}

/**
 * Handles clicks on quantity change buttons and remove buttons within the cart.
 */
function handleCartControlsClick(event) {
  const target = event.target;
  const index = parseInt(target.dataset.index);

  if (target.classList.contains('increase-quantity-btn')) {
    cart[index].quantity++;
  } else if (target.classList.contains('decrease-quantity-btn')) {
    if (cart[index].quantity > 1) {
      cart[index].quantity--;
    } else {
      // If quantity is 1 and decreased, remove the item
      cart.splice(index, 1);
    }
  } else if (target.classList.contains('remove-item-btn')) {
    cart.splice(index, 1); // Remove item from array
  }
  updateCartDisplay(); // Re-render cart after changes
}

/**
 * Handles the "Buy All Items" button click within the cart modal.
 */
function handleBuyAllItemsClick() {
  if (cart.length > 0) {
    const orderId = Date.now().toString().slice(-6); // Simple 6-digit order ID
    const orderTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    // Store the completed order
    orders.push({
      orderId: orderId,
      items: [...cart], // Create a copy of the cart items
      total: orderTotal,
      date: new Date().toLocaleString()
    });

    console.log("Processing order for:", cart);
    cart = []; // Clear the cart
    updateCartDisplay(); // Update display to show empty cart
    closeModal(shoppingCartModal); // Close cart modal
    showOrderConfirmation(orderId); // Show success message with order ID
  }
}

// --- Event Listeners Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  // Add event listeners to all "Add to Cart" buttons
  document.querySelectorAll('.add-to-cart-btn').forEach(button => {
    button.addEventListener('click', handleAddToCartClick);
  });

  // Add event listeners to all "Buy Now" buttons
  document.querySelectorAll('.buy-now-btn').forEach(button => {
    button.addEventListener('click', handleBuyNowClick);
  });

  // Event listener for the shopping cart icon in the navbar
  cartIconButton.addEventListener('click', () => {
    openModal(shoppingCartModal);
  });

  // Event listener for closing modals (using the 'x' button)
  document.querySelectorAll('.modal .close-button').forEach(button => {
    button.addEventListener('click', (event) => {
      closeModal(event.target.closest('.modal'));
    });
  });

  // Event listener for closing order confirmation from its own button
  document.querySelector('#order-confirmation-modal .close-confirmation-btn').addEventListener('click', () => {
    closeModal(orderConfirmationModal);
  });

  // Event listener for "Buy All Items" button in the cart modal
  buyAllItemsBtn.addEventListener('click', handleBuyAllItemsClick);

  // Event delegation for quantity controls and remove buttons inside the cart
  cartItemsContainer.addEventListener('click', handleCartControlsClick);

  // Initial update of cart display (in case of persisted cart or on load)
  updateCartDisplay();
  updateCartCount(); // Ensure cart count is correct on load

  // --- Order Tracker Specific Event Listeners ---
  orderTrackerLink.addEventListener('click', (event) => {
    event.preventDefault(); // Prevent default link behavior
    openModal(orderTrackerModal);
    orderNumberInput.value = ''; // Clear input on open
    orderStatusDisplay.textContent = 'Enter an order number above.'; // Reset status message
    orderStatusDisplay.classList.remove('success', 'error'); // Clear status styling
  });

  document.querySelector('#order-tracker-modal .close-tracker-btn').addEventListener('click', () => {
    closeModal(orderTrackerModal);
  });

  trackOrderBtn.addEventListener('click', () => {
    const orderNumber = orderNumberInput.value.trim();
    if (orderNumber) {
      trackOrder(orderNumber);
    } else {
      orderStatusDisplay.textContent = 'Please enter a valid order number.';
      orderStatusDisplay.classList.add('error');
    }
  });
});
