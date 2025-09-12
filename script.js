document.addEventListener('DOMContentLoaded', () => {
    // --- SIMULACIÓN DE BASE DE DATOS ---
    const mockData = {
        products: [
            { id: 1, name: 'Pizza Margherita', category: 'Pizzas', price: 15.99, imageUrl: 'https://via.placeholder.com/50', isActive: true },
            { id: 2, name: 'Pizza Pepperoni', category: 'Pizzas', price: 18.99, imageUrl: 'https://via.placeholder.com/50', isActive: true },
            { id: 3, name: 'Coca Cola 500ml', category: 'Bebidas', price: 2.50, imageUrl: 'https://via.placeholder.com/50', isActive: false },
        ],
        customers: [
            { id: 1, name: 'Juan Pérez', phone: '555-1234', lastOrder: '2025-09-10', totalOrders: 3 },
            { id: 2, name: 'Ana Gómez', phone: '555-5678', lastOrder: '2025-09-11', totalOrders: 5 },
        ],
        orders: [
            { id: 1, code: 'EA-0925-123', customerId: 1, address: 'Calle Falsa 123, Sprinfield', status: 'pendiente', total: 21.49, date: '2025-09-11T10:30:00', notes: 'Sin cebolla, por favor', lat: 34.0522, lng: -118.2437, items: [{ productId: 1, quantity: 1, price: 15.99 }, { productId: 3, quantity: 2, price: 2.50 }] },
            { id: 2, code: 'EA-0925-456', customerId: 2, address: 'Avenida Siempreviva 742', status: 'en_proceso', total: 18.99, date: '2025-09-11T11:00:00', notes: '', lat: 34.0522, lng: -118.2437, items: [{ productId: 2, quantity: 1, price: 18.99 }] },
            { id: 3, code: 'EA-0925-789', customerId: 1, address: 'Calle Falsa 123, Sprinfield', status: 'completado', total: 34.98, date: '2025-09-10T18:00:00', notes: 'Mucha salsa picante', lat: 34.0522, lng: -118.2437, items: [{ productId: 1, quantity: 2, price: 15.99 }] },
        ]
    };

    // --- NAVEGACIÓN ENTRE PÁGINAS ---
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('href').substring(1);
            
            pages.forEach(page => page.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // --- DASHBOARD ---
    function updateDashboard() {
        const pending = mockData.orders.filter(o => o.status === 'pendiente').length;
        const inProcess = mockData.orders.filter(o => o.status === 'en_proceso').length;
        const completed = mockData.orders.filter(o => o.status === 'completado').length;
        const cancelled = mockData.orders.filter(o => o.status === 'cancelado').length;

        document.getElementById('pending-orders-count').textContent = pending;
        document.getElementById('in-process-orders-count').textContent = inProcess;
        document.getElementById('completed-orders-count').textContent = completed;
        document.getElementById('cancelled-orders-count').textContent = cancelled;

        // Simulación de ventas (no es un cálculo real basado en fechas)
        document.getElementById('sales-today').textContent = '$150.45';
        document.getElementById('sales-week').textContent = '$1,230.80';
        document.getElementById('sales-month').textContent = '$5,890.20';
        
        loadCharts();
    }

    function loadCharts() {
        const salesByDayCtx = document.getElementById('salesByDayChart').getContext('2d');
        new Chart(salesByDayCtx, {
            type: 'line',
            data: {
                labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
                datasets: [{
                    label: 'Ventas de la semana',
                    data: [120, 190, 150, 250, 220, 300, 280],
                    borderColor: 'rgba(74, 144, 226, 1)',
                    backgroundColor: 'rgba(74, 144, 226, 0.2)',
                    fill: true,
                }]
            },
        });

        const salesByCategoryCtx = document.getElementById('salesByCategoryChart').getContext('2d');
        new Chart(salesByCategoryCtx, {
            type: 'doughnut',
            data: {
                labels: ['Pizzas', 'Bebidas', 'Postres', 'Entradas'],
                datasets: [{
                    label: 'Ventas por Categoría',
                    data: [300, 50, 100, 80],
                    backgroundColor: ['#4a90e2', '#f5a623', '#7ed321', '#d0021b'],
                }]
            },
        });
    }

    // --- GESTIÓN DE PEDIDOS ---
    const ordersTableBody = document.querySelector('#orders-table tbody');
    let ordersDataTable;

    function renderOrdersTable() {
        ordersTableBody.innerHTML = '';
        mockData.orders.forEach(order => {
            const customer = mockData.customers.find(c => c.id === order.customerId);
            const row = `
                <tr data-order-id="${order.id}">
                    <td>${order.code}</td>
                    <td>${customer.name} (${customer.phone})</td>
                    <td>${order.address}</td>
                    <td><span class="status-badge status-${order.status.replace('_', '-')}">${order.status.replace('_', ' ')}</span></td>
                    <td>$${order.total.toFixed(2)}</td>
                    <td>${new Date(order.date).toLocaleString()}</td>
                    <td>
                        <button class="btn btn-sm btn-primary view-details-btn">Ver</button>
                        <button class="btn btn-sm btn-danger cancel-order-btn">Cancelar</button>
                    </td>
                </tr>
            `;
            ordersTableBody.insertAdjacentHTML('beforeend', row);
        });
        
        // Inicializar DataTables si no existe
        if (!ordersDataTable) {
             ordersDataTable = $('#orders-table').DataTable({
                language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }
             });
        }
    }
    
    // --- GESTIÓN DE CLIENTES Y PRODUCTOS (similar a pedidos) ---
    function renderGenericTable(tableId, data, columns) {
        const table = $(`#${tableId}`).DataTable({
            destroy: true, // Permite reinicializar la tabla
            data: data,
            columns: columns,
            language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }
        });
    }

    function loadCustomersPage() {
        const columns = [
            { data: 'name' },
            { data: 'phone' },
            { data: 'lastOrder' },
            { data: 'totalOrders' },
            { defaultContent: `<button class="btn btn-sm btn-primary">Ver Historial</button>` }
        ];
        renderGenericTable('customers-table', mockData.customers, columns);
    }
    
    function loadProductsPage() {
        const productData = mockData.products.map(p => ({
            ...p,
            imageUrl: `<img src="${p.imageUrl}" alt="${p.name}" width="40" style="border-radius: 5px;">`,
            isActive: p.isActive ? '<span class="status-badge status-completado">Activo</span>' : '<span class="status-badge status-cancelado">Inactivo</span>',
        }));
        
        const columns = [
            { data: 'imageUrl' },
            { data: 'name' },
            { data: 'category' },
            { data: 'price', render: (data) => `$${data.toFixed(2)}` },
            { data: 'isActive' },
            { defaultContent: `<button class="btn btn-sm btn-primary">Editar</button> <button class="btn btn-sm btn-danger">Eliminar</button>` }
        ];
        renderGenericTable('products-table', productData, columns);
    }


    // --- MODAL DE DETALLES DEL PEDIDO ---
    const modal = document.getElementById('order-details-modal');
    const closeModalBtn = document.querySelector('.modal .close-btn');
    let map;

    function openOrderDetailsModal(orderId) {
        const order = mockData.orders.find(o => o.id === orderId);
        if (!order) return;

        const customer = mockData.customers.find(c => c.id === order.customerId);

        document.getElementById('modal-order-code').textContent = order.code;
        document.getElementById('modal-customer-name').textContent = customer.name;
        document.getElementById('modal-customer-phone').textContent = customer.phone;
        document.getElementById('modal-customer-address').textContent = order.address;
        document.getElementById('modal-customer-notes').textContent = order.notes || 'Ninguna';
        document.getElementById('modal-order-total').textContent = `$${order.total.toFixed(2)}`;
        
        const productList = document.getElementById('modal-product-list');
        productList.innerHTML = '';
        order.items.forEach(item => {
            const product = mockData.products.find(p => p.id === item.productId);
            const li = document.createElement('li');
            li.textContent = `${item.quantity} x ${product.name} - $${(item.quantity * item.price).toFixed(2)}`;
            productList.appendChild(li);
        });

        modal.style.display = 'block';
        
        // Inicializar o actualizar mapa
        if (!map) {
            map = L.map('map').setView([order.lat, order.lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);
        } else {
            map.setView([order.lat, order.lng], 15);
        }
        L.marker([order.lat, order.lng]).addTo(map);
    }
    
    closeModalBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };
    
    // Asignar evento a los botones "Ver"
    ordersTableBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-details-btn')) {
            const orderId = parseInt(e.target.closest('tr').dataset.orderId);
            openOrderDetailsModal(orderId);
        }
    });

    // --- NOTIFICACIÓN EN TIEMPO REAL ---
    function showNotification() {
        const notification = document.getElementById('notification');
        const audio = new Audio('./assets/new-notification-014-363678.mp3'); // Asegúrate de tener este archivo
        audio.play();
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }
    
    // Simular la llegada de un nuevo pedido después de 10 segundos
    setTimeout(() => {
        // Lógica para añadir un nuevo pedido a mockData y volver a renderizar la tabla
        showNotification();
    }, 10000);


    // --- INICIALIZACIÓN ---
    function init() {
        updateDashboard();
        renderOrdersTable();
        loadCustomersPage();
        loadProductsPage();
        document.querySelector('.nav-link[href="#dashboard"]').click(); // Abrir dashboard por defecto
    }

    init();
});