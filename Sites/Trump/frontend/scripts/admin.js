document.addEventListener('DOMContentLoaded', () => {
  const APP_BASE = '/Trump';
  const apiPath = path => `${APP_BASE}${path}`;
  const resolveAssetPath = path => {
    const raw = String(path || '').trim();
    if (!raw) return raw;
    if (/^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
    if (raw.startsWith(`${APP_BASE}/`)) return raw;
    if (raw.startsWith('/')) return `${APP_BASE}${raw}`;
    return `${APP_BASE}/${raw}`;
  };
  const socket = io({ path: `${APP_BASE}/socket.io` }); 
  const RESTAURANT_ID = 'trump';
  const authHeaders = { 
    'Content-Type': 'application/json'
  };
  const logoutButton = document.getElementById('logoutButton');
  const currentUserPill = document.getElementById('currentUserPill');

  const mainCategorySelect = document.getElementById("mainCategorySelect");
  const subCategorySelect = document.getElementById("subCategorySelect");
  const addMainCategorySelect = document.getElementById("addMainCategorySelect");
  const addSubCategorySelect = document.getElementById("addSubCategorySelect");
  const menuItemList = document.getElementById("menuItemList");
  const itemForm = document.getElementById("itemForm");
  const editIndexInput = document.getElementById("editIndex");
  const saveItemBtn = document.getElementById("saveItemBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const toggleMainCategoryBtn = document.getElementById("toggleMainCategoryDisplay");
  const toggleSubCategoryBtn = document.getElementById("toggleSubCategoryDisplay");
  const currentOrdersContent = document.getElementById("currentOrdersContent");
  const orderHistoryContent = document.getElementById("orderHistoryContent");
  const revenueSummary = document.getElementById("revenueSummary");

  // Tabs
  const tabMenuBtn = document.getElementById("tabMenu");
  const tabCurrentOrdersBtn = document.getElementById("tabCurrentOrders");
  const tabOrderHistoryBtn = document.getElementById("tabOrderHistory");
  const tabDealBtn = document.getElementById("tabDeal");
  const tabRecommendBtn = document.getElementById("tabRecommend");
  const tabCurrentChatBtn = document.getElementById("tabCurrentChat");
  const tabChatHistoryBtn = document.getElementById("tabChatHistory");
  const tabAccountsBtn = document.getElementById("tabAccounts");

  // Sections
  const menuSection = document.getElementById("menuEditor");
  const currentOrdersSection = document.getElementById("currentOrders");
  const orderHistorySection = document.getElementById("orderHistory");
  const dealSection = document.getElementById("dealSection");
  const recommendSection = document.getElementById("recommendSection");
  const currentChatSection = document.getElementById("currentChatSection");
  const chatHistorySection = document.getElementById("chatHistorySection");
  const accountSection = document.getElementById("accountSection");

  const currentChatContainer = document.getElementById("currentChatContainer");
  const historyChatContainer = document.getElementById("historyChatContainer");
  const btnRefreshHistory = document.getElementById("btnRefreshHistory");
  const accountForm = document.getElementById("accountForm");
  const accountRole = document.getElementById("accountRole");
  const accountList = document.getElementById("accountList");
  const accountStatus = document.getElementById("accountStatus");
  const refreshAccountsBtn = document.getElementById("refreshAccountsBtn");

  const SPECIAL_WORDS = ["birthday", "anniversary", "event", "celebration", "party", "gathering", "festival", "ceremony", "function", "occasion", "milestone", "achievement", "accomplishment", "success", "breakthrough", "win", "completion", "goal", "target", "engagement", "wedding", "proposal", "reception", "honeymoon", "commitment", "union", "reunion", "graduation", "convocation", "admission", "orientation", "farewell", "retirement", "promotion", "transfer", "date"];

  let menuData = {};
  let categoryStructure = {};
  let dealOfTheDay = { items: [], price: 0 }; 
  let allDealsData = []; 
  let currentPairing = []; 
  let allRecommendationsData = [];
  let currentUser = null;

  const escapeHtml = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const itemKey = (item) => `${item.main || ''}::${item.sub || ''}::${item.name}`;

  // --- NEW FEATURE LOGIC ---

  // 1. Spice Control Logic
  window.adjustSpice = (delta) => {
      const input = document.getElementById('itemSpice');
      let val = parseInt(input.value) || 0;
      val += delta;
      if (val < 0) val = 0;
      if (val > 10) val = 10;
      input.value = val;
  };

  // 2. File Upload Logic
  window.handleFileUpload = async (input) => {
      const file = input.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append('mediaFile', file);

      const statusDiv = document.getElementById('uploadStatus');
      statusDiv.textContent = "Uploading...";

      try {
          const res = await fetch(apiPath('/api/upload'), {
              method: 'POST',
              body: formData
          });

          if (!res.ok) throw new Error("Upload failed. Check format (JPG/MP4 only).");
          
          const data = await res.json();
          statusDiv.textContent = "âœ… Upload Successful: " + data.filePath;

          // Auto-assign to hidden fields
          if (data.type === 'video/mp4') {
              document.getElementById('itemVideo').value = data.filePath;
          } else {
              document.getElementById('itemImg').value = data.filePath;
          }
      } catch (err) {
          statusDiv.textContent = "âŒ Error: " + err.message;
          input.value = ""; 
      }
  };

  async function initializeAdmin() {
    await loadCurrentUser();
    configureAccountUi();
    await refreshUI();
  }

  async function refreshUI() {
    await loadMenu();
    populateMainCategories();
    populateSubcategories();
    renderItemList();
    setupAddCategorySelectors();
    populateCategorySelectorsForTab(dealMainCategorySelect);
    populateCategorySelectorsForTab(recMainCategorySelect);
    await loadAllDeals();
    await loadAllRecommendations();
    await loadCurrentOrders();
    if (currentUser && accountSection) await loadAccounts();
  }

  async function loadCurrentUser() {
    const resp = await fetch(apiPath('/api/auth/me'), { headers: authHeaders });
    const data = resp.ok ? await resp.json() : {};
    if (!data.user) {
      window.location.href = `${APP_BASE}/Login?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }

    currentUser = data.user;
    if (currentUserPill) {
      currentUserPill.textContent = `${currentUser.label || currentUser.username} - ${currentUser.role}`;
    }
  }

  function configureAccountUi() {
    if (!currentUser || !accountRole) return;
    if (currentUser.role === 'manager') {
      accountRole.innerHTML = '<option value="waiter">Waiter</option>';
    } else {
      accountRole.innerHTML = '<option value="manager">Manager</option><option value="waiter">Waiter</option>';
    }
  }

  async function loadAccounts() {
    if (!accountList) return;
    try {
      const resp = await fetch(apiPath('/api/auth/accounts'), { headers: authHeaders });
      if (!resp.ok) throw new Error('Unable to load accounts');
      const accounts = await resp.json();
      renderAccounts(Array.isArray(accounts) ? accounts : []);
    } catch (error) {
      accountList.innerHTML = `<p>${escapeHtml(error.message || 'Account list unavailable.')}</p>`;
    }
  }

  function renderAccounts(accounts) {
    accountList.innerHTML = '';
    if (!accounts.length) {
      accountList.innerHTML = '<p>No managed accounts yet.</p>';
      return;
    }

    accounts.forEach(account => {
      const isSuspended = account.status === 'suspended';
      const row = document.createElement('div');
      row.className = `account-row${isSuspended ? ' is-suspended' : ''}`;
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(account.label || account.username)}</strong>
          <small>${escapeHtml(account.username)} - ${escapeHtml(account.role)} - ${escapeHtml(account.status || 'active')}</small>
        </div>
        <button
          type="button"
          class="${isSuspended ? 'account-activate' : 'account-suspend'}"
          data-account-action="status"
          data-username="${escapeHtml(account.username)}"
          data-status="${isSuspended ? 'active' : 'suspended'}"
        >${isSuspended ? 'Activate' : 'Suspend'}</button>
      `;
      accountList.appendChild(row);
    });
  }

  async function createAccount(event) {
    event.preventDefault();
    accountStatus.textContent = 'Creating account...';
    const payload = {
      username: document.getElementById('accountUsername').value.trim(),
      label: document.getElementById('accountLabel').value.trim(),
      role: accountRole.value,
      password: document.getElementById('accountPassword').value
    };

    try {
      const resp = await fetch(apiPath('/api/auth/accounts'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Account create failed');
      accountStatus.textContent = `${data.username} created.`;
      accountForm.reset();
      configureAccountUi();
      await loadAccounts();
    } catch (error) {
      accountStatus.textContent = error.message || 'Account create failed.';
    }
  }

  async function updateAccountStatus(username, status) {
    try {
      const resp = await fetch(apiPath(`/api/auth/accounts/${encodeURIComponent(username)}`), {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ status })
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Account update failed');
      accountStatus.textContent = `${data.username} is ${data.status}.`;
      await loadAccounts();
    } catch (error) {
      accountStatus.textContent = error.message || 'Account update failed.';
    }
  }

  async function loadMenu() {
    try {
      const resp = await fetch(apiPath('/api/menu'));
      if (!resp.ok) throw new Error(`Server responded with ${resp.status}`);
      menuData = await resp.json();
      categoryStructure = getCategoryStructure(menuData);
    } catch (err) {
      console.error("Loading menu failed:", err);
      menuData = {}; categoryStructure = {};
    }
  }

  async function saveMenu() {
    try {
      const resp = await fetch(apiPath('/api/menu'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(menuData),
      });
      if (!resp.ok) throw new Error('Failed to save menu');
    } catch (err) {
      console.error("Saving menu failed:", err);
      alert("Failed to save menu data.");
    }
  }

  function getCategoryStructure(data) {
    const struct = {};
    if (!data || typeof data !== 'object') return struct;
    for (const key in data) {
      const value = data[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        struct[key] = Object.keys(value).filter(subKey => subKey !== 'items' && subKey !== 'visible');
      } else { struct[key] = []; }
    }
    return struct;
  }

  function populateDropdown(selectElem, items, defaultOptionText) {
    selectElem.innerHTML = '';
    if (defaultOptionText) {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = ""; defaultOpt.textContent = defaultOptionText;
      selectElem.appendChild(defaultOpt);
    }
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item; opt.textContent = item;
      selectElem.appendChild(opt);
    });
  }

  function populateMainCategories() {
    const categories = Object.keys(categoryStructure);
    populateDropdown(mainCategorySelect, categories);
    populateDropdown(addMainCategorySelect, categories);
  }

  function populateSubcategories() {
    const mainCat = mainCategorySelect.value;
    const subcats = categoryStructure[mainCat] || [];
    toggleSubCategoryBtn.style.display = subcats.length > 0 ? 'inline-block' : 'none';
    subCategorySelect.style.display = subcats.length > 0 ? 'inline-block' : 'none';
    subCategorySelect.required = subcats.length > 0;
    if (subcats.length > 0) populateDropdown(subCategorySelect, subcats);
    renderItemList();
  }

  function setupAddCategorySelectors() {
    const mainCat = addMainCategorySelect.value;
    const subcats = categoryStructure[mainCat] || [];
    addSubCategorySelect.style.display = subcats.length > 0 ? 'inline-block' : 'none';
    addSubCategorySelect.required = subcats.length > 0;
    if (subcats.length > 0) populateDropdown(addSubCategorySelect, subcats);
  }

  function renderItemList() {
    const mainCat = mainCategorySelect.value;
    const subCat = subCategorySelect.style.display !== 'none' ? subCategorySelect.value : null;
    let items = getItems(mainCat, subCat);
    menuItemList.innerHTML = '';
    if (!items || items.length === 0) {
      menuItemList.innerHTML = `<p style='text-align:center;color:#999;'>No items in this category.</p>`;
      return;
    }
    items.forEach((item, index) => {
      const visible = item.visible !== false;
      
      // Update logic to show status of both
      const imgStatus = item.imageVisible !== false ? 'ON' : 'OFF';
      const vidStatus = item.videoVisible !== false ? 'ON' : 'OFF';

      const itemDiv = document.createElement('div');
      itemDiv.className = 'item-list-item';
      itemDiv.innerHTML = `
        <img src="${escapeHtml(resolveAssetPath(item.img || 'Images/Tomahawk.jpg'))}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none';"/>
        <div style="flex:1;">
          <strong>${escapeHtml(item.name)}</strong>
          <small style="display:block;">${escapeHtml(item.description || '')}</small>
          <small style="display:block;">Price: R${(item.price ?? 0).toFixed(2)} | Spice: ${item.spice||0} | Img: ${imgStatus} | Vid: ${vidStatus}</small>
        </div>
        <div style="display:flex; flex-direction:column; gap:5px; width:80px;">
          <button onclick="moveItem(${index}, 'up')" ${index === 0 ? 'disabled' : ''}>â†‘</button>
          <button onclick="moveItem(${index}, 'down')" ${index === items.length - 1 ? 'disabled' : ''}>â†“</button>
          <button onclick="editItem(${index})">Edit</button>
          <button onclick="deleteItem(${index})" style="background:var(--accent-danger);color:white;">Delete</button>
          <button class="toggle-display-btn ${visible ? 'toggle-visible' : 'toggle-hidden'}">${visible ? 'Visible' : 'Hidden'}</button>
        </div>`;
      
      const toggleBtn = itemDiv.querySelector('.toggle-display-btn');
      toggleBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const currentItems = getItems(mainCat, subCat);
        currentItems[index].visible = !currentItems[index].visible;
        await saveMenu();
        renderItemList();
      });
      menuItemList.appendChild(itemDiv);
    });
  }

  function getItems(mainCat, subCat) {
    if (!menuData || !mainCat) return [];
    const mainCatData = menuData[mainCat];
    if (!mainCatData) return [];
    if (subCat) {
      const subCatData = mainCatData[subCat];
      return subCatData ? subCatData.items || [] : [];
    }
    return Array.isArray(mainCatData) ? mainCatData : mainCatData.items || [];
  }
  
  window.moveItem = async (index, direction) => {
    const mainCat = mainCategorySelect.value;
    const subCat = subCategorySelect.style.display !== 'none' ? subCategorySelect.value : null;
    let items = getItems(mainCat, subCat);
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    await saveMenu();
    renderItemList();
  };

  window.editItem = (index) => {
    const mainCat = mainCategorySelect.value;
    const subCat = subCategorySelect.style.display !== 'none' ? subCategorySelect.value : null;
    let items = getItems(mainCat, subCat);
    const item = items[index];
    if (!item) return;
    addMainCategorySelect.value = mainCat;
    setupAddCategorySelectors();
    if(subCat) addSubCategorySelect.value = subCat;
    
    editIndexInput.value = index;
    itemForm.itemName.value = item.name || '';
    itemForm.itemDescription.value = item.description || '';
    itemForm.itemPrice.value = item.price ?? '';
    itemForm.itemCalories.value = item.calories || '';
    itemForm.itemAllergens.value = item.allergens || '';
    
    itemForm.itemSpice.value = item.spice || 0;
    
    // NEW: Load specific flags (default to true if undefined, backward compatible with old mediaVisible)
    const oldMediaFlag = item.mediaVisible !== false;
    document.getElementById('itemImageVisible').checked = item.imageVisible !== undefined ? item.imageVisible : oldMediaFlag;
    document.getElementById('itemVideoVisible').checked = item.videoVisible !== undefined ? item.videoVisible : oldMediaFlag;
    
    itemForm.itemImg.value = item.img || '';
    itemForm.itemVideo.value = item.video || '';
    
    // Clear upload status
    document.getElementById('uploadStatus').textContent = "";
    
    saveItemBtn.textContent = 'Save Changes';
    cancelEditBtn.style.display = 'inline-block';
    document.getElementById('formTitle').scrollIntoView({ behavior: 'smooth' });
  };

  window.deleteItem = async (index) => {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const mainCat = mainCategorySelect.value;
    const subCat = subCategorySelect.style.display !== 'none' ? subCategorySelect.value : null;
    let items = getItems(mainCat, subCat);
    items.splice(index, 1);
    await saveMenu();
    renderItemList();
  };

  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mainCat = addMainCategorySelect.value;
    const subCat = addSubCategorySelect.style.display !== 'none' ? addSubCategorySelect.value : null;
    if (!mainCat) { alert("Please select a main category."); return; }
    
    let items;
    if (subCat) {
      if (!menuData[mainCat][subCat]) menuData[mainCat][subCat] = { visible: true, items: [] };
      items = menuData[mainCat][subCat].items;
    } else {
      if (!menuData[mainCat].items) menuData[mainCat].items = [];
      items = menuData[mainCat].items;
    }
    const newItem = {
      name: itemForm.itemName.value.trim(),
      description: itemForm.itemDescription.value.trim(),
      price: parseFloat(itemForm.itemPrice.value) || 0,
      calories: itemForm.itemCalories.value.trim(),
      allergens: itemForm.itemAllergens.value.trim(),
      spice: parseInt(itemForm.itemSpice.value) || 0,
      
      // NEW: Specific flags
      imageVisible: document.getElementById('itemImageVisible').checked,
      videoVisible: document.getElementById('itemVideoVisible').checked,
      
      img: itemForm.itemImg.value.trim(),
      video: itemForm.itemVideo.value.trim(),
      visible: true
    };
    const idx = parseInt(editIndexInput.value, 10);
    if (idx > -1) {
      newItem.visible = items[idx].visible;
      items[idx] = newItem;
    } else {
      items.push(newItem);
    }
    await saveMenu();
    await refreshUI();
    
    // Reset Form
    itemForm.reset();
    editIndexInput.value = -1;
    saveItemBtn.textContent = 'Add Item';
    cancelEditBtn.style.display = 'none';
    document.getElementById('uploadStatus').textContent = "";
    
    // Reset checkboxes to default true
    document.getElementById('itemImageVisible').checked = true;
    document.getElementById('itemVideoVisible').checked = true;
    document.getElementById('itemSpice').value = 0;
  });

  cancelEditBtn.addEventListener("click", () => {
    itemForm.reset();
    editIndexInput.value = -1;
    saveItemBtn.textContent = "Add Item";
    cancelEditBtn.style.display = "none";
    document.getElementById('uploadStatus').textContent = "";
  });

  function switchTab(tabKey) {
    [menuSection, currentOrdersSection, orderHistorySection, dealSection, recommendSection, currentChatSection, chatHistorySection, accountSection]
      .filter(Boolean)
      .forEach(s => s.classList.remove('active'));
    [tabMenuBtn, tabCurrentOrdersBtn, tabOrderHistoryBtn, tabDealBtn, tabRecommendBtn, tabCurrentChatBtn, tabChatHistoryBtn, tabAccountsBtn]
      .filter(Boolean)
      .forEach(b => b.classList.remove('active'));

    const tabMap = {
      menu: { section: menuSection, btn: tabMenuBtn },
      current: { section: currentOrdersSection, btn: tabCurrentOrdersBtn },
      history: { section: orderHistorySection, btn: tabOrderHistoryBtn },
      deal: { section: dealSection, btn: tabDealBtn },
      recommend: { section: recommendSection, btn: tabRecommendBtn },
      currentChat: { section: currentChatSection, btn: tabCurrentChatBtn },
      chatHistory: { section: chatHistorySection, btn: tabChatHistoryBtn },
      accounts: { section: accountSection, btn: tabAccountsBtn }
    };
    
    if(tabMap[tabKey]) {
        tabMap[tabKey].section.classList.add('active');
        tabMap[tabKey].btn.classList.add('active');
    }
    if(tabKey === 'chatHistory') loadChatHistory();
    if(tabKey === 'accounts') loadAccounts();
  }

  // --- Orders & History Logic ---
  async function loadCurrentOrders() {
    try {
      const resp = await fetch(apiPath('/orders'), { headers: authHeaders });
      if (!resp.ok) throw new Error("Failed to load");
      const orders = await resp.json();
      renderOrders(orders, currentOrdersContent, { canComplete: true, canDelete: true, type: "orders" });
    } catch (err) {
      currentOrdersContent.innerHTML = "<p style='text-align:center;'>Failed to load current orders.</p>";
    }
  }

  async function loadOrderHistory() {
    try {
      const resp = await fetch(apiPath('/history'), { headers: authHeaders });
      if (!resp.ok) throw new Error("Failed to load");
      const orders = await resp.json();
      renderOrders(orders, orderHistoryContent, { canDelete: true, canMarkIncomplete: true, type: "history" });
      renderRevenueSummary(orders);
    } catch (err) {
      orderHistoryContent.innerHTML = "<p style='text-align:center;'>Failed to load order history.</p>";
      revenueSummary.innerHTML = '';
    }
  }

  function renderRevenueSummary(orders) {
    const totalsByDate = {};
    orders.forEach(order => {
      if (!order.timestamp || !order.totals) return;
      const dateObj = new Date(order.timestamp);
      const monthDay = `${dateObj.getMonth() + 1}-${dateObj.getDate()}`;
      totalsByDate[monthDay] = (totalsByDate[monthDay] || 0) + (order.totals.total || 0);
    });
    let html = '<strong>Revenue by Month-Day (ZAR):</strong> ';
    for (const [date, total] of Object.entries(totalsByDate)) {
      html += `<span style="margin-right:1rem;">${date}: R${total.toFixed(2)}</span>`;
    }
    revenueSummary.innerHTML = html;
  }

  function renderOrders(orders, container, options) {
    container.innerHTML = '';
    if (!orders || orders.length === 0) {
      container.innerHTML = "<p style='text-align:center;'>No orders found.</p>";
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "flex-row";
    orders.forEach(order => {
      const card = document.createElement("div");
      card.style.cssText = `background:var(--bg-dark-tertiary); padding:12px; border-radius:8px; margin:8px; width:320px; box-shadow:var(--shadow-sm);`;
      const orderDate = order.timestamp ? new Date(order.timestamp).toLocaleString() : 'No timestamp';
      const items = Array.isArray(order.items) ? order.items : [];
      const itemsHtml = items.map(item => {
        const qty = item.qty ?? item.quantity ?? 1;
        return `<li>${escapeHtml(item.name)} &times; ${escapeHtml(qty)}</li>`;
      }).join('');
      let buttonsHtml = '';
      if (options.canComplete) buttonsHtml += `<button onclick="markComplete('${order.filename}')" style="flex:1;">Complete</button>`;
      if (options.canMarkIncomplete) buttonsHtml += `<button onclick="markIncomplete('${order.filename}')" style="flex:1;">Mark Incomplete</button>`;
      if (options.canDelete) buttonsHtml += `<button onclick="deleteOrder('${options.type}', '${order.filename}')" style="flex:1; background:var(--accent-danger);color:white;">Delete</button>`;
      
      const tableText = order.table_number ? `Table: ${order.table_number}` : (order.Table || "Unknown Table");

      card.innerHTML = `
        <h4 style="margin:0 0 6px;color:var(--accent-gold);">${escapeHtml(order.filename.replace(/\.json$/, ''))}</h4>
        <div style="background: #333; color: #4caf50; padding: 4px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px; font-weight: bold; border: 1px solid #4caf50;">
           ${escapeHtml(tableText)}
        </div>
        <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:8px;">${orderDate}</div>
        <ul>${itemsHtml}</ul>
        <div>Total: R${(order.totals?.total ?? 0).toFixed(2)}</div>
        <div style="margin-top:10px;display:flex;gap:5px;">${buttonsHtml}</div>
      `;
      wrapper.appendChild(card);
    });
    container.appendChild(wrapper);
  }

  window.markComplete = async (filename) => {
    if (!confirm("Mark order as complete? This will RESET the table cart.")) return;
    await fetch(apiPath('/complete'), { method: 'POST', headers: authHeaders, body: JSON.stringify({ filename }) });
    loadCurrentOrders();
    loadOrderHistory();
  };

  window.markIncomplete = async (filename) => {
    if (!confirm("Mark order as incomplete?")) return;
    await fetch(apiPath('/incomplete'), { method: 'POST', headers: authHeaders, body: JSON.stringify({ filename }) });
    loadCurrentOrders();
    loadOrderHistory();
  };

  window.deleteOrder = async (type, filename) => {
    if (!confirm("Delete this order permanently?")) return;
    await fetch(apiPath(`/delete/${type}/${encodeURIComponent(filename)}`), { method: 'DELETE', headers: authHeaders });
    if (type === 'orders') loadCurrentOrders();
    else loadOrderHistory();
  };

  // --- Deal of the Day Logic ---
  function populateCategorySelectorsForTab(mainSelectElem) {
     const categories = Object.keys(categoryStructure);
     populateDropdown(mainSelectElem, categories, "Select a Category");
  }

  function getFilteredFoodItems(mainCat, subCat) {
    if (!mainCat) return [];
    let allItems = [];
    const mainData = menuData[mainCat];
    if (!mainData) return [];
    if (subCat && subCat !== "") {
      if (mainData[subCat] && mainData[subCat].items) {
        allItems = mainData[subCat].items.map(i => ({...i, main: mainCat, sub: subCat}));
      }
    } else {
      if(mainData.items) allItems.push(...mainData.items.map(i => ({...i, main: mainCat, sub: null})));
      Object.keys(mainData).forEach(key => {
        if (key !== 'items' && key !== 'visible' && mainData[key]?.items) {
          allItems.push(...mainData[key].items.map(i => ({...i, main: mainCat, sub: key})));
        }
      });
    }
    return allItems;
  }

  function populateDealSubcategories() {
    const mainCat = dealMainCategorySelect.value;
    const subcats = categoryStructure[mainCat] || [];
    dealSubCategorySelect.style.display = subcats.length > 0 ? 'inline-block' : 'none';
    if (subcats.length > 0) populateDropdown(dealSubCategorySelect, subcats, "All Subcategories");
    renderDealEditor();
  }

  function renderDealEditor() {
    const mainCat = dealMainCategorySelect.value;
    const subCat = dealSubCategorySelect.style.display !== 'none' ? dealSubCategorySelect.value : null;
    const foodItems = getFilteredFoodItems(mainCat, subCat);
    dealFoodList.innerHTML = '';
    foodItems.forEach(item => {
      const id = `deal-item-${itemKey(item).replace(/::/g, '-')}`;
      const isChecked = dealOfTheDay.items.some(dealItem => itemKey(dealItem) === itemKey(item));
      const div = document.createElement('div');
      div.innerHTML = `<input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}> <label for="${id}">${escapeHtml(item.name)}</label>`;
      div.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) dealOfTheDay.items.push(item);
        else dealOfTheDay.items = dealOfTheDay.items.filter(i => itemKey(i) !== itemKey(item));
        renderDealSelectedList();
      });
      dealFoodList.appendChild(div);
    });
  }

  function renderDealSelectedList() {
    dealSelectedList.innerHTML = '';
    let total = 0;
    dealOfTheDay.items.forEach(item => {
      total += item.price || 0;
      const li = document.createElement('li');
      li.textContent = escapeHtml(item.name);
      dealSelectedList.appendChild(li);
    });
    dealTotalPrice.textContent = `R${total.toFixed(2)}`;
  }
  
  async function loadAllDeals() {
    try {
      const resp = await fetch(apiPath('/api/deals'), { headers: authHeaders });
      allDealsData = resp.ok ? await resp.json() : [];
      renderAllDealsList();
    } catch(e) { allDealsData = []; renderAllDealsList(); }
  }

  function renderAllDealsList() {
    allDealsList.innerHTML = '';
    if (allDealsData.length === 0) {
      allDealsList.innerHTML = '<p>No deals have been saved yet.</p>';
      return;
    }
    allDealsData.forEach((deal, index) => {
      const originalPrice = deal.items.reduce((sum, item) => sum + (item.price || 0), 0);
      const dealCard = document.createElement('div');
      dealCard.style.cssText = "background:var(--bg-dark-tertiary); padding:12px; border-radius:8px; margin-bottom:12px; position:relative;";
      const hiddenStyle = deal.hidden ? 'opacity:0.5; filter: grayscale(0.7);' : '';
      dealCard.innerHTML = `
        <h4>Deal #${index + 1}: <span style="color:var(--accent-gold)">R${deal.price.toFixed(2)}</span> (was R${originalPrice.toFixed(2)})</h4>
        <ul>${deal.items.map(item => `<li>${escapeHtml(item.name)}</li>`).join('')}</ul>
        <div style="display:flex; gap:0.5rem; margin-top:8px; ${hiddenStyle}">
          <button data-index="${index}" class="edit-deal-btn edit-btn">Edit</button>
          <button data-index="${index}" class="hide-deal-btn hide-btn">${deal.hidden ? 'Unhide' : 'Hide'}</button>
          <button data-index="${index}" class="delete-deal-btn delete-btn">Delete</button>
        </div>
      `;
      allDealsList.appendChild(dealCard);
    });

    document.querySelectorAll('.edit-deal-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = +e.target.dataset.index;
        dealOfTheDay = structuredClone(allDealsData[idx]);
        dealNewPrice.value = dealOfTheDay.price;
        if(dealOfTheDay.items.length > 0) {
          dealMainCategorySelect.value = dealOfTheDay.items[0].main || '';
          populateDealSubcategories();
          dealSubCategorySelect.value = dealOfTheDay.items[0].sub || '';
        } else {
          dealMainCategorySelect.value = '';
          dealSubCategorySelect.value = '';
        }
        renderDealEditor();
        renderDealSelectedList();
        switchTab('deal');
      });
    });

    document.querySelectorAll('.hide-deal-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const idx = +e.target.dataset.index;
        allDealsData[idx].hidden = !allDealsData[idx].hidden;
        await saveDealsData(allDealsData);
        await loadAllDeals();
      });
    });

    document.querySelectorAll('.delete-deal-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Delete this deal?')) return;
        allDealsData.splice(+e.target.dataset.index, 1);
        await saveDealsData(allDealsData);
        await loadAllDeals();
      });
    });
  }

  async function saveDealsData(deals) {
    try {
      const resp = await fetch(apiPath('/api/deals'), { method: 'POST', headers: authHeaders, body: JSON.stringify(deals) });
      if (!resp.ok) throw new Error("Failed");
    } catch(e) { dealStatus.textContent = 'Error saving deals.'; }
  }

  saveDealBtn.addEventListener('click', async () => {
    const price = parseFloat(dealNewPrice.value);
    if (isNaN(price) || price <= 0 || dealOfTheDay.items.length === 0) {
      dealStatus.textContent = 'Invalid price or no items.';
      setTimeout(() => dealStatus.textContent = '', 3000);
      return;
    }
    const newDeal = { ...dealOfTheDay, price };
    let foundIndex = allDealsData.findIndex(d => {
       if (d.price !== newDeal.price) return false;
       if (d.items.length !== newDeal.items.length) return false;
       return newDeal.items.every(ni => d.items.some(di => itemKey(di) === itemKey(ni)));
    });
    if (foundIndex > -1) allDealsData[foundIndex] = newDeal;
    else allDealsData.push(newDeal);

    await saveDealsData(allDealsData);
    dealStatus.textContent = 'Deal saved!';
    dealOfTheDay = { items: [], price: 0 };
    dealNewPrice.value = '';
    renderDealEditor();
    renderDealSelectedList();
    await loadAllDeals();
    setTimeout(() => dealStatus.textContent = '', 3000);
  });

  // --- RECOMMENDATIONS LOGIC ---
  function populateRecSubcategories() {
    const mainCat = recMainCategorySelect.value;
    const subcats = categoryStructure[mainCat] || [];
    recSubCategorySelect.style.display = subcats.length > 0 ? 'inline-block' : 'none';
    if (subcats.length > 0) populateDropdown(recSubCategorySelect, subcats, "All Subcategories");
    renderRecEditor();
  }

  function renderRecEditor() {
    const mainCat = recMainCategorySelect.value;
    const subCat = recSubCategorySelect.style.display !== 'none' ? recSubCategorySelect.value : null;
    const foodItems = getFilteredFoodItems(mainCat, subCat);
    recFoodList.innerHTML = '';
    foodItems.forEach(item => {
      const id = `rec-item-${itemKey(item).replace(/::/g, '-')}`;
      const isChecked = currentPairing.some(pItem => itemKey(pItem) === itemKey(item));
      const div = document.createElement('div');
      div.innerHTML = `<input type="checkbox" id="${id}" ${isChecked ? 'checked' : ''}> <label for="${id}">${escapeHtml(item.name)}</label>`;
      div.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) currentPairing.push(item);
        else currentPairing = currentPairing.filter(i => itemKey(i) !== itemKey(item));
        renderRecSelectedList();
      });
      recFoodList.appendChild(div);
    });
  }

  function renderRecSelectedList() {
    recSelectedList.innerHTML = '';
    currentPairing.forEach(item => {
      const li = document.createElement('li');
      li.textContent = escapeHtml(item.name);
      recSelectedList.appendChild(li);
    });
  }

  async function loadAllRecommendations() {
    try {
      const resp = await fetch(apiPath('/api/recommendations'), { headers: authHeaders }); 
      allRecommendationsData = resp.ok ? await resp.json() : [];
      renderAllRecsList();
    } catch(e) { 
      allRecommendationsData = []; 
      renderAllRecsList();
    }
  }

  function renderAllRecsList() {
    allRecsList.innerHTML = '';
    if (allRecommendationsData.length === 0) {
      allRecsList.innerHTML = '<p>No recommendations saved.</p>';
      return;
    }
    allRecommendationsData.forEach((rec, index) => {
      const recCard = document.createElement('div');
      recCard.style.cssText = "background:var(--bg-dark-tertiary); padding:12px; border-radius:8px; margin-bottom:12px; position:relative;";
      recCard.innerHTML = `
        <h4>${escapeHtml(rec.description || 'Pairing #' + (index+1))}</h4>
        <ul>${rec.items.map(item => `<li>${escapeHtml(item.name)}</li>`).join('')}</ul>
        <div style="display:flex; gap:0.5rem; margin-top:8px;">
          <button data-index="${index}" class="delete-rec-btn delete-btn">Delete</button>
        </div>
      `;
      allRecsList.appendChild(recCard);
    });

    document.querySelectorAll('.delete-rec-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        if (!confirm('Remove this recommendation?')) return;
        allRecommendationsData.splice(+e.target.dataset.index, 1);
        await saveRecommendationsData(allRecommendationsData);
        await loadAllRecommendations();
      });
    });
  }

  async function saveRecommendationsData(recs) {
    try {
      const resp = await fetch(apiPath('/api/recommendations'), {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(recs)
      });
      if (!resp.ok) throw new Error("Failed");
    } catch(e) {
      recStatus.textContent = 'Error saving recommendations.';
      setTimeout(() => recStatus.textContent = '', 3000);
    }
  }

  saveRecBtn.addEventListener('click', async () => {
    if (currentPairing.length === 0) {
      recStatus.textContent = 'Please select at least one item.';
      setTimeout(() => recStatus.textContent = '', 3000);
      return;
    }
    const newRec = { 
      items: currentPairing, 
      description: recDescription.value.trim() 
    };
    allRecommendationsData.push(newRec);
    await saveRecommendationsData(allRecommendationsData);
    recStatus.textContent = 'Recommendation saved!';
    currentPairing = [];
    recDescription.value = '';
    renderRecEditor();
    renderRecSelectedList();
    await loadAllRecommendations();
    setTimeout(() => recStatus.textContent = '', 3000);
  });

  // --- Socket.IO Listeners ---
  socket.on('connect', () => {
    socket.emit('joinAdmin', { restaurantId: RESTAURANT_ID });
  });

  socket.on('menuUpdated', refreshUI);
  socket.on('orderPlaced', () => {
      loadCurrentOrders(); 
      if(Notification.permission === "granted") new Notification("New Order Received!");
      console.log("New order received!");
  });
  socket.on('orderUpdated', () => { loadCurrentOrders(); loadOrderHistory(); });
  socket.on('dealUpdated', loadAllDeals);
  socket.on('recommendationUpdated', loadAllRecommendations);
  socket.on('waiterCallAlert', (data = {}) => {
    if (currentChatContainer.querySelector('p')) currentChatContainer.innerHTML = '';

    const tableLabel = data.displayTable || data.tableId || 'Unknown';
    const message = data.message || 'Waiter update received';
    const div = document.createElement('div');
    div.className = 'chat-bubble special-event-bubble';
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
          <span class="table-badge">Table ${escapeHtml(tableLabel)}</span>
          <small style="color:#888">${escapeHtml(new Date().toLocaleTimeString())}</small>
      </div>
      <div style="margin-bottom:5px;">${escapeHtml(message)}</div>
      <div style="color:var(--accent-success); font-size:0.9rem;"><strong>Waiter:</strong> ${escapeHtml(data.waiterName || 'On duty')}</div>`;

    currentChatContainer.prepend(div);
    if (Notification.permission === "granted") {
      new Notification("Waiter call update", { body: message });
    }
  });

  // --- LIVE CHAT ---
  socket.on('newChatLog', (log) => {
    if (currentChatContainer.querySelector('p')) currentChatContainer.innerHTML = '';
    
    const div = document.createElement('div');
    const isSpecial = log.is_special || false; 

    div.className = isSpecial ? 'chat-bubble special-event-bubble' : 'chat-bubble';

    let safeMsg = escapeHtml(log.message);
    if(isSpecial) {
        const regex = new RegExp(`(${SPECIAL_WORDS.join('|')})`, 'gi');
        safeMsg = safeMsg.replace(regex, '<span class="highlight-word">$1</span>');
        if(Notification.permission === "granted") {
            new Notification(`ðŸŽ‰ Special Event at Table ${log.tableId}!`, { body: log.message });
        }
    }

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
          <span class="table-badge">Table ${log.tableId}</span>
          <small style="color:#888">${log.timestamp}</small>
      </div>
      <div style="margin-bottom:5px;">${safeMsg}</div>
      <div style="color:var(--accent-success); font-size:0.9rem;"><strong>Bot:</strong> ${escapeHtml(log.reply || '')}</div>`;
    
    currentChatContainer.prepend(div);
  });

  async function loadChatHistory() {
      const tableQuery = document.getElementById('searchHistoryTable').value.toLowerCase();
      const dateQuery = document.getElementById('searchHistoryDate').value;
      
      try {
        const resp = await fetch(apiPath('/api/chat-history'), { headers: authHeaders });
        const data = await resp.json();
        const logs = Array.isArray(data) ? data : [];
        historyChatContainer.innerHTML = '';
        
        const filtered = logs.filter(log => {
            const mTable = log.tableId.toString().toLowerCase().includes(tableQuery);
            const mDate = dateQuery ? log.date === dateQuery : true;
            return mTable && mDate;
        });

        filtered.reverse().forEach(log => {
            const div = document.createElement('div');
            const isSpecial = log.is_special || false;
            div.className = isSpecial ? 'chat-bubble special-event-bubble' : 'chat-bubble';
            
            let safeMsg = escapeHtml(log.message);
            if(isSpecial) {
                const regex = new RegExp(`(${SPECIAL_WORDS.join('|')})`, 'gi');
                safeMsg = safeMsg.replace(regex, '<span class="highlight-word">$1</span>');
            }

            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                    <span class="table-badge">Table ${log.tableId}</span>
                    <small>${log.date} ${log.timestamp}</small>
                </div>
                <div style="margin-bottom:5px;">${safeMsg}</div>
                <div style="color:var(--accent-success); font-size:0.9rem;"><strong>Bot:</strong> ${escapeHtml(log.reply || '')}</div>`;
            historyChatContainer.appendChild(div);
        });
      } catch(e) {
        historyChatContainer.innerHTML = "<p>History not available.</p>";
      }
  }
  btnRefreshHistory.addEventListener('click', loadChatHistory);
  if (logoutButton) {
    logoutButton.addEventListener('click', async () => {
      await fetch(apiPath('/api/auth/logout'), { method: 'POST' });
      window.location.href = `${APP_BASE}/Login`;
    });
  }

  // --- Event Listeners ---
  mainCategorySelect.addEventListener('change', populateSubcategories);
  subCategorySelect.addEventListener('change', renderItemList);
  addMainCategorySelect.addEventListener('change', setupAddCategorySelectors);
  
  dealMainCategorySelect.addEventListener('change', populateDealSubcategories);
  dealSubCategorySelect.addEventListener('change', renderDealEditor);

  recMainCategorySelect.addEventListener('change', populateRecSubcategories);
  recSubCategorySelect.addEventListener('change', renderRecEditor);

  tabMenuBtn.addEventListener('click', () => switchTab('menu'));
  tabCurrentOrdersBtn.addEventListener('click', () => { switchTab('current'); loadCurrentOrders(); });
  tabOrderHistoryBtn.addEventListener('click', () => { switchTab('history'); loadOrderHistory(); });
  tabDealBtn.addEventListener('click', () => { switchTab('deal'); populateCategorySelectorsForTab(dealMainCategorySelect); });
  tabRecommendBtn.addEventListener('click', () => { switchTab('recommend'); populateCategorySelectorsForTab(recMainCategorySelect); loadAllRecommendations(); });
  tabCurrentChatBtn.addEventListener('click', () => switchTab('currentChat'));
  tabChatHistoryBtn.addEventListener('click', () => switchTab('chatHistory'));
  if (tabAccountsBtn) tabAccountsBtn.addEventListener('click', () => switchTab('accounts'));
  if (accountForm) accountForm.addEventListener('submit', createAccount);
  if (refreshAccountsBtn) refreshAccountsBtn.addEventListener('click', loadAccounts);
  if (accountList) {
    accountList.addEventListener('click', event => {
      const button = event.target.closest('[data-account-action="status"]');
      if (!button) return;
      updateAccountStatus(button.dataset.username, button.dataset.status);
    });
  }

  initializeAdmin();
});
