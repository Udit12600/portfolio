const API_BASE = "https://fakestoreapi.com";

// ---------- State ----------
let allProducts = [];
let activeCategory = "all";
let searchTerm = "";
let sortOrder = "default";
let cart = JSON.parse(localStorage.getItem("tl-cart") || "[]");
let wishlist = JSON.parse(localStorage.getItem("tl-wishlist") || "[]");

// ---------- DOM refs ----------
const productGrid = document.getElementById("productGrid");
const resultCount = document.getElementById("resultCount");
const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");
const catChips = document.getElementById("catChips");
const cartCountEl = document.getElementById("cartCount");
const wishlistCountEl = document.getElementById("wishlistCount");
const toast = document.getElementById("toast");

// ---------- Init ----------
fetch(`${API_BASE}/products`)
  .then((res) => res.json())
  .then((data) => {
    allProducts = data;
    buildCategoryChips();
    renderProducts();
    updateCounts();
  })
  .catch(() => {
    resultCount.textContent = "Could not load products. Check your connection.";
  });

function buildCategoryChips() {
  const categories = [...new Set(allProducts.map((p) => p.category))];
  catChips.innerHTML = categories
    .map((c) => `<button class="chip" data-cat="${c}">${capitalize(c)}</button>`)
    .join("");
}

function capitalize(str) {
  return str.replace(/(^|'s )\w/g, (m) => m.toUpperCase());
}

// Deterministic "was" price so discounts look consistent, not random each render
function getWasPrice(product) {
  const bump = 1.15 + ((product.id * 7) % 20) / 100; // 1.15–1.34x
  return product.price * bump;
}

function getDiscountPercent(product) {
  const was = getWasPrice(product);
  return Math.round(((was - product.price) / was) * 100);
}

// ---------- Rendering ----------
function renderProducts() {
  let list = [...allProducts];

  if (activeCategory !== "all") {
    list = list.filter((p) => p.category === activeCategory);
  }
  if (searchTerm.trim()) {
    const q = searchTerm.toLowerCase();
    list = list.filter((p) => p.title.toLowerCase().includes(q));
  }
  if (sortOrder === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (sortOrder === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (sortOrder === "rating-desc") list.sort((a, b) => (b.rating?.rate || 0) - (a.rating?.rate || 0));

  resultCount.textContent = `${list.length} product${list.length !== 1 ? "s" : ""}`;

  if (list.length === 0) {
    productGrid.innerHTML = `<div class="empty-state">No products match your search.</div>`;
    return;
  }

  productGrid.innerHTML = list.map(cardTemplate).join("");
}

function cardTemplate(product) {
  const was = getWasPrice(product);
  const discount = getDiscountPercent(product);
  const isWished = wishlist.some((w) => w.id === product.id);

  return `
    <div class="product-card">
      <div class="product-img-wrap">
        <span class="discount-badge">${discount}% OFF</span>
        <button class="wishlist-toggle ${isWished ? "active" : ""}" data-id="${product.id}" data-action="wishlist">♥</button>
        <img src="${product.image}" alt="${escapeHtml(product.title)}" loading="lazy">
      </div>
      <div class="product-info">
        <span class="product-cat">${capitalize(product.category)}</span>
        <span class="product-title">${escapeHtml(product.title)}</span>
        <div class="rating-row">★ ${product.rating?.rate ?? "—"} (${product.rating?.count ?? 0})</div>
        <div class="price-row">
          <span class="price-now">$${product.price.toFixed(2)}</span>
          <span class="price-was">$${was.toFixed(2)}</span>
        </div>
        <button class="add-to-cart" data-id="${product.id}" data-action="cart">Add to Bag</button>
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Event delegation for product grid ----------
productGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  const product = allProducts.find((p) => p.id === id);
  if (!product) return;

  if (btn.dataset.action === "cart") {
    addToCart(product);
  } else if (btn.dataset.action === "wishlist") {
    toggleWishlist(product, btn);
  }
});

// ---------- Category chips + nav links ----------
catChips.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setActiveCategory(chip.dataset.cat, chip);
});

document.getElementById("navLinks").addEventListener("click", (e) => {
  const link = e.target.closest(".cat-link");
  if (!link) return;
  e.preventDefault();
  document.querySelectorAll(".cat-link").forEach((l) => l.classList.remove("active"));
  link.classList.add("active");
  setActiveCategory(link.dataset.cat);
});

function setActiveCategory(cat, chipEl) {
  activeCategory = cat;
  document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
  if (chipEl) chipEl.classList.add("active");
  renderProducts();
}

// ---------- Search + sort ----------
searchInput.addEventListener("input", (e) => {
  searchTerm = e.target.value;
  renderProducts();
});
sortSelect.addEventListener("change", (e) => {
  sortOrder = e.target.value;
  renderProducts();
});

// ---------- Cart ----------
function addToCart(product) {
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  saveCart();
  showToast(`Added "${truncate(product.title, 30)}" to your bag`);
}

function updateQty(id, qty) {
  if (qty < 1) {
    removeFromCart(id);
    return;
  }
  const item = cart.find((i) => i.id === id);
  if (item) item.qty = qty;
  saveCart();
  renderCartDrawer();
}

function removeFromCart(id) {
  cart = cart.filter((i) => i.id !== id);
  saveCart();
  renderCartDrawer();
}

function saveCart() {
  localStorage.setItem("tl-cart", JSON.stringify(cart));
  updateCounts();
}

function renderCartDrawer() {
  const cartItems = document.getElementById("cartItems");
  const cartFooter = document.getElementById("cartFooter");

  if (cart.length === 0) {
    cartItems.innerHTML = `<div class="empty-drawer">Your bag is empty.</div>`;
    cartFooter.innerHTML = "";
    return;
  }

  cartItems.innerHTML = cart
    .map(
      (item) => `
    <div class="cart-line">
      <img src="${item.image}" alt="${escapeHtml(item.title)}">
      <div class="cart-line-info">
        <div class="cart-line-title">${escapeHtml(item.title)}</div>
        <div class="rating-row">$${item.price.toFixed(2)}</div>
        <div class="qty-row">
          <button class="qty-btn" data-id="${item.id}" data-delta="-1">−</button>
          <span>${item.qty}</span>
          <button class="qty-btn" data-id="${item.id}" data-delta="1">+</button>
        </div>
        <button class="remove-link" data-id="${item.id}" data-action="remove">Remove</button>
      </div>
    </div>
  `
    )
    .join("");

  const total = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
  cartFooter.innerHTML = `
    <div class="cart-total-row"><span>Total</span><span>$${total.toFixed(2)}</span></div>
    <button class="checkout-btn" id="checkoutBtn">Checkout</button>
  `;
}

document.getElementById("cartItems").addEventListener("click", (e) => {
  const qtyBtn = e.target.closest(".qty-btn");
  const removeBtn = e.target.closest("[data-action='remove']");
  if (qtyBtn) {
    const id = parseInt(qtyBtn.dataset.id, 10);
    const delta = parseInt(qtyBtn.dataset.delta, 10);
    const item = cart.find((i) => i.id === id);
    if (item) updateQty(id, item.qty + delta);
  } else if (removeBtn) {
    removeFromCart(parseInt(removeBtn.dataset.id, 10));
  }
});

document.getElementById("cartFooter").addEventListener("click", (e) => {
  if (e.target.id === "checkoutBtn") {
    alert("This is a demo checkout — no real payment is made.");
  }
});

// ---------- Wishlist ----------
function toggleWishlist(product, btnEl) {
  const exists = wishlist.some((w) => w.id === product.id);
  if (exists) {
    wishlist = wishlist.filter((w) => w.id !== product.id);
    if (btnEl) btnEl.classList.remove("active");
  } else {
    wishlist.push(product);
    if (btnEl) btnEl.classList.add("active");
  }
  localStorage.setItem("tl-wishlist", JSON.stringify(wishlist));
  updateCounts();
  renderWishlistDrawer();
}

function renderWishlistDrawer() {
  const wishlistItems = document.getElementById("wishlistItems");
  if (wishlist.length === 0) {
    wishlistItems.innerHTML = `<div class="empty-drawer">Your wishlist is empty.</div>`;
    return;
  }
  wishlistItems.innerHTML = wishlist
    .map(
      (item) => `
    <div class="cart-line">
      <img src="${item.image}" alt="${escapeHtml(item.title)}">
      <div class="cart-line-info">
        <div class="cart-line-title">${escapeHtml(item.title)}</div>
        <div class="rating-row">$${item.price.toFixed(2)}</div>
        <button class="add-to-cart" data-id="${item.id}" data-action="cart" style="margin-top:0.5rem;">Add to Bag</button>
      </div>
    </div>
  `
    )
    .join("");
}

document.getElementById("wishlistItems").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='cart']");
  if (!btn) return;
  const id = parseInt(btn.dataset.id, 10);
  const product = allProducts.find((p) => p.id === id) || wishlist.find((p) => p.id === id);
  if (product) addToCart(product);
});

// ---------- Counts ----------
function updateCounts() {
  const cartQty = cart.reduce((sum, item) => sum + item.qty, 0);
  cartCountEl.textContent = cartQty;
  wishlistCountEl.textContent = wishlist.length;
}

// ---------- Drawers open/close ----------
const cartDrawer = document.getElementById("cartDrawer");
const wishlistDrawer = document.getElementById("wishlistDrawer");
const overlay = document.getElementById("drawerOverlay");

document.getElementById("cartBtn").addEventListener("click", () => {
  renderCartDrawer();
  openDrawer(cartDrawer);
});
document.getElementById("wishlistBtn").addEventListener("click", () => {
  renderWishlistDrawer();
  openDrawer(wishlistDrawer);
});
document.getElementById("closeCartBtn").addEventListener("click", () => closeDrawers());
document.getElementById("closeWishlistBtn").addEventListener("click", () => closeDrawers());
overlay.addEventListener("click", () => closeDrawers());

function openDrawer(drawerEl) {
  closeDrawers();
  drawerEl.classList.add("open");
  overlay.classList.add("open");
}
function closeDrawers() {
  cartDrawer.classList.remove("open");
  wishlistDrawer.classList.remove("open");
  overlay.classList.remove("open");
}

// ---------- Toast ----------
let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}
