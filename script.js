document.addEventListener('DOMContentLoaded', () => {
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
    async function updateDashboard() {
        // Fetch order statistics from Supabase
        const { data: stats, error } = await supabaseClient.rpc('get_order_stats');

        if (error) {
            console.error('Error fetching order stats:', error);
            return;
        }

        const {
            pending_orders,
            completed_orders,
            cancelled_orders,
            total_revenue
        } = stats[0];

        // We assume "en_proceso" is not directly calculated by the function, you might need to adjust this
        const { data: inProcessOrders, error: inProcessError } = await supabaseClient
            .from('orders')
            .select('id', { count: 'exact' })
            .eq('status', 'en_proceso');

        document.getElementById('pending-orders-count').textContent = pending_orders || 0;
        document.getElementById('in-process-orders-count').textContent = inProcessOrders ? inProcessOrders.length : 0;
        document.getElementById('completed-orders-count').textContent = completed_orders || 0;
        document.getElementById('cancelled-orders-count').textContent = cancelled_orders || 0;

        // Simulating sales for now as the function only returns total revenue
        document.getElementById('sales-today').textContent = `$${(total_revenue / 30).toFixed(2)}`; // Placeholder
        document.getElementById('sales-week').textContent = `$${(total_revenue / 4).toFixed(2)}`; // Placeholder
        document.getElementById('sales-month').textContent = `$${total_revenue.toFixed(2)}`;

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
                    data: [120, 190, 150, 250, 220, 300, 280], // This should be replaced with real data
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
                labels: ['Pizzas', 'Bebidas', 'Postres', 'Entradas'], // This should be replaced with real data
                datasets: [{
                    label: 'Ventas por Categoría',
                    data: [300, 50, 100, 80],
                    backgroundColor: ['#4a90e2', '#f5a623', '#7ed321', '#d0021b'],
                }]
            },
        });
    }

    // --- GESTIÓN DE PEDIDOS ---
    let ordersDataTable;

    async function renderOrdersTable() {
        // Fetch orders from the view_orders_with_customer view
        const { data: orders, error } = await supabaseClient
            .from('view_orders_with_customer')
            .select('*');

        if (error) {
            console.error('Error fetching orders:', error);
            return;
        }

        const tableData = orders.map(order => ({
            ...order,
            status: `<span class="status-badge status-${order.status.replace('_', '-')}">${order.status.replace('_', ' ')}</span>`,
            total: `$${order.total.toFixed(2)}`,
            created_at: new Date(order.created_at).toLocaleString(),
            actions: `
                <button class="btn btn-sm btn-primary view-details-btn" data-order-id="${order.id}">Ver</button>
                <button class="btn btn-sm btn-danger cancel-order-btn" data-order-id="${order.id}">Cancelar</button>
            `
        }));

        if (ordersDataTable) {
            ordersDataTable.destroy();
        }

        ordersDataTable = $('#orders-table').DataTable({
            data: tableData,
            columns: [
                { data: 'order_code' },
                { data: 'customer_name' },
                { data: 'customer_address' },
                { data: 'status' },
                { data: 'total' },
                { data: 'created_at' },
                { data: 'actions' }
            ],
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }
        });
    }

    // --- GESTIÓN DE CLIENTES ---
    async function loadCustomersPage() {
        // Fetches data and correctly assigns it to the 'customers' variable
        const { data: customers, error } = await supabaseClient
            .from('customers')
            .select('*');

        if (error) {
            console.error('Error fetching customers:', error);
            return;
        }

        const columns = [
            { data: 'name' },
            { data: 'phone' },
            { defaultContent: 'N/A' }, // lastOrder needs to be calculated
            { defaultContent: 'N/A' }, // totalOrders needs to be calculated
            { defaultContent: `<button class="btn btn-sm btn-primary">Ver Historial</button>` }
        ];
        
        // Correctly passes the 'customers' variable to the function
        renderGenericTable('customers-table', customers, columns);
    }

    // --- GESTIÓN DE PRODUCTOS ---
    async function loadProductsPage() {
        // Fetches data and assigns it to the 'products' variable
        const { data: products, error } = await supabaseClient
            .from('view_products_with_category')
            .select('*');

        if (error) {
            console.error('Error fetching products:', error);
            return;
        }

        // The rest of your logic to format the data
        const productData = products.map(p => ({
            ...p,
            image_url: `<img src="${p.image_url || 'https://via.placeholder.com/50'}" alt="${p.name}" width="40" style="border-radius: 5px;">`,
            is_active: p.is_active ? '<span class="status-badge status-completado">Activo</span>' : '<span class="status-badge status-cancelado">Inactivo</span>',
            category_name: p.category_name || 'Sin categoría' // Handle null category
        }));
        
        const columns = [
            { data: 'image_url' },
            { data: 'name' },
            { data: 'category_name' },
            { data: 'price', render: (data) => `$${data ? data.toFixed(2) : '0.00'}` }, // Handle null price
            { data: 'is_active' },
            { defaultContent: `<button class="btn btn-sm btn-primary">Editar</button> <button class="btn btn-sm btn-danger">Eliminar</button>` }
        ];

        // Correctly passes the formatted 'productData' variable
        renderGenericTable('products-table', productData, columns);
    }

    function renderGenericTable(tableId, data, columns) {
        $(`#${tableId}`).DataTable({
            destroy: true,
            data: data,
            columns: columns,
            language: { url: 'https://cdn.datatables.net/plug-ins/1.13.6/i18n/es-ES.json' }
        });
    }

    // --- MODAL DE DETALLES DEL PEDIDO ---
    const modal = document.getElementById('order-details-modal');
    const closeModalBtn = document.querySelector('.modal .close-btn');
    let map;

    async function openOrderDetailsModal(orderId) {
        const { data: orderData, error } = await supabase
            .from('view_orders_with_customer')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error) {
            console.error('Error fetching order details:', error);
            return;
        }

        const { data: items, error: itemsError } = await supabase
            .from('view_order_items_detailed')
            .select('*')
            .eq('order_id', orderId);

        if (itemsError) {
            console.error('Error fetching order items:', itemsError);
            return;
        }

        document.getElementById('modal-order-code').textContent = orderData.order_code;
        document.getElementById('modal-customer-name').textContent = orderData.customer_name;
        document.getElementById('modal-customer-phone').textContent = orderData.customer_phone;
        document.getElementById('modal-customer-address').textContent = orderData.customer_address;
        document.getElementById('modal-customer-notes').textContent = orderData.notes || 'Ninguna';
        document.getElementById('modal-order-total').textContent = `$${orderData.total.toFixed(2)}`;

        const productList = document.getElementById('modal-product-list');
        productList.innerHTML = '';
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `${item.quantity} x ${item.product_name} - $${item.subtotal.toFixed(2)}`;
            productList.appendChild(li);
        });

        modal.style.display = 'block';

        const lat = orderData.lat || 34.0522;
        const lng = orderData.lng || -118.2437;

        if (!map) {
            map = L.map('map').setView([lat, lng], 15);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            }).addTo(map);
        } else {
            map.setView([lat, lng], 15);
        }
        L.marker([lat, lng]).addTo(map);
    }

    closeModalBtn.onclick = () => modal.style.display = 'none';
    window.onclick = (event) => {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    };

    $('#orders-table').on('click', '.view-details-btn', function () {
        const orderId = $(this).data('order-id');
        openOrderDetailsModal(orderId);
    });

    // --- NOTIFICACIÓN EN TIEMPO REAL (con Supabase Realtime) ---
    function showNotification() {
        const notification = document.getElementById('notification');
        // You might need to add an audio file for the notification sound
        // const audio = new Audio('./assets/new-notification.mp3'); 
        // audio.play();
        notification.classList.add('show');
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }

    // Listen for new orders
    supabaseClient.channel('public:orders') // <-- ¡CORREGIDO!
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            console.log('New order received!', payload);
            showNotification();
            renderOrdersTable();
            updateDashboard();
        })
        .subscribe();


    // --- INICIALIZACIÓN ---
    async function init() {
        await updateDashboard();
        await renderOrdersTable();
        await loadCustomersPage();
        await loadProductsPage();
        document.querySelector('.nav-link[href="#dashboard"]').click();
    }

    init();
});