const defaultConfig = {
    page_title: "Bản Đồ Khu Vực",
    location_name: "Trường Song Ngữ Lạc Hồng",
    location_address: "152/16 Huỳnh Văn Nghệ, Bửu Long, Biên Hòa, Đồng Nai"
};

let selectedRadius = null;
let map = null;
let circle = null;
let marker = null;

const locationCoords = [10.956268521381734, 106.80185644183922];

// Biến trạng thái tuyến đường
let additionalCircles = [];
let isDrawingRoute = false;
let routePoints = []; 
let routePolyline = null; 
let routeMarkers = []; 
let routeBuffer = null; 

// Biến quản lý trạng thái Test
let routeInterval = null; 
let stayTimeout = null; 
let testInterval = null; 
let testMarkerForRoute = null; 
let testMarkerForStay = null; 
let testMarkers = []; 
let isTestingOffRoute = false; // Trạng thái kiểm soát kịch bản đi sai tuyến

const CIRCLE_COLORS = [
    '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
    '#ec4899', '#14b8a6', '#f97316', '#06b6d4', '#84cc16'
];

// --------------------------------------------------------
// SDK & Config Initialization
// --------------------------------------------------------

async function onConfigChange(config) {
    const pageTitle = config.page_title || defaultConfig.page_title;
    const locationName = config.location_name || defaultConfig.location_name;
    const locationAddress = config.location_address || defaultConfig.location_address;

    document.getElementById('pageTitle').textContent = pageTitle;
    document.getElementById('mapTitle').textContent = pageTitle;
    document.getElementById('locationNameDisplay').textContent = locationName;
    document.getElementById('locationAddressDisplay').textContent = locationAddress;

    if (marker) {
        marker.setPopupContent(`
            <div class="popup-header">
                <span>🏫</span>
                <span>${locationName}</span>
            </div>
            <div class="popup-body">${locationAddress}</div>
        `);
    }
}

if (window.elementSdk) {
    window.elementSdk.init({
        defaultConfig,
        onConfigChange,
        mapToCapabilities: (config) => ({
            recolorables: [],
            borderables: [],
            fontEditable: undefined,
            fontSizeable: undefined
        }),
        mapToEditPanelValues: (config) => new Map([
            ["page_title", config.page_title || defaultConfig.page_title],
            ["location_name", config.location_name || defaultConfig.location_name],
            ["location_address", config.location_address || defaultConfig.location_address]
        ])
    });
}

// --------------------------------------------------------
// Utility Functions (Toast, Alert, Dừng Test)
// --------------------------------------------------------

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

function showSuccessToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 500);
    }, 2000);
}

function showErrorAlert(title, message) {
    const modal = document.createElement('div');
    modal.className = 'error-alert-modal';
    modal.innerHTML = `
        <div class="error-alert-content">
            <div class="error-alert-icon-wrapper">
                <div class="error-icon">🚫</div>
            </div>
            <h2 class="error-alert-title">${title}</h2>
            <p class="error-alert-message">${message}</p>
            <button class="error-alert-close">Đóng</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    modal.querySelector('.error-alert-close').addEventListener('click', () => {
        modal.style.animation = 'modalFadeOut 0.3s ease forwards';
        setTimeout(() => modal.remove(), 300);
    });
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.animation = 'modalFadeOut 0.3s ease forwards';
            setTimeout(() => modal.remove(), 300);
        }
    });
}

function showAlert(title, message) {
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        padding: 32px 40px;
        border-radius: 20px;
        box-shadow: 0 20px 60px rgba(239, 68, 68, 0.5);
        z-index: 10001;
        text-align: center;
        border: 3px solid rgba(255, 255, 255, 0.3);
        min-width: 350px;
        animation: alertPop 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
    `;
    
    alertDiv.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 16px; animation: alertShake 0.5s ease infinite;">🚨</div>
        <div style="font-size: 24px; font-weight: 900; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 2px;">${title}</div>
        <div style="font-size: 16px; font-weight: 500; opacity: 0.95; line-height: 1.6;">${message}</div>
    `;
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.animation = 'alertPopOut 0.3s ease forwards';
        setTimeout(() => alertDiv.remove(), 300);
    }, 4000);
}

// Hàm Dừng tất cả các bài kiểm tra
function stopAllTests(silent = false) {
    let stoppedCount = 0;
    const stopBtn = document.getElementById('stopTestsBtn');
    
    // Dừng Route Following
    if (routeInterval) {
        clearInterval(routeInterval);
        routeInterval = null;
        if (testMarkerForRoute) map.removeLayer(testMarkerForRoute);
        testMarkerForRoute = null;
        stoppedCount++;
    }
    
    // Dừng Intrusion Test
    if (testInterval) {
        clearInterval(testInterval);
        testInterval = null;
        testMarkers.forEach(item => map.removeLayer(item.marker));
        testMarkers = [];
        stoppedCount++;
    }

    // Dừng Stay Long Test
    if (stayTimeout) {
        clearTimeout(stayTimeout);
        stayTimeout = null;
        if (testMarkerForStay) map.removeLayer(testMarkerForStay);
        testMarkerForStay = null;
        stoppedCount++;
    }

    if (stopBtn) stopBtn.style.display = 'none';

    if (stoppedCount > 0 && !silent) {
        showToast(`✅ Đã dừng ${stoppedCount} bài kiểm tra đang chạy!`);
    }
}

// Gán sự kiện cho nút Dừng Kiểm Tra
document.getElementById('stopTestsBtn').addEventListener('click', () => stopAllTests());


// --------------------------------------------------------
// Screen Transitions & Device ID Logic
// --------------------------------------------------------

// Loading screen animation
setTimeout(() => {
    document.getElementById('loadingScreen').classList.add('hidden');
    setTimeout(() => {
        document.getElementById('deviceIdScreen').classList.add('active');
    }, 800);
}, 2500);

// Device ID submit with validation
document.getElementById('deviceIdSubmit').addEventListener('click', () => {
    const deviceId = document.getElementById('deviceIdInput').value.trim();
    
    if (!deviceId) {
        showToast('⚠️ Vui lòng nhập ID thiết bị!');
        shakeInput();
        return;
    }

    document.getElementById('deviceIdScreen').classList.remove('active');
    
    setTimeout(() => {
        document.getElementById('searchingScreen').classList.add('active');
        
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += 2;
            document.getElementById('progressPercentage').textContent = progress + '%';
            
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, 100);
        
        setTimeout(() => {
            document.getElementById('searchingScreen').classList.remove('active');
            
            if (deviceId !== '001') {
                setTimeout(() => {
                    showErrorAlert('🚫 KHÔNG QUÉT ĐƯỢC ID', `ID thiết bị "${deviceId}" không hợp lệ hoặc không được phép truy cập!`);
                    shakeInput();
                    
                    setTimeout(() => {
                        document.getElementById('deviceIdScreen').classList.add('active');
                        document.getElementById('deviceIdInput').value = '';
                    }, 500);
                }, 400);
                return;
            }

            sessionStorage.setItem('deviceId', deviceId);

            setTimeout(() => {
                showSuccessToast('✅ Tìm thấy thiết bị! Xác thực thành công!');
                
                setTimeout(() => {
                    document.getElementById('selectionScreen').classList.add('active');
                }, 800);
            }, 400);
        }, 5000);
    }, 600);
});

function shakeInput() {
    const input = document.getElementById('deviceIdInput');
    input.style.animation = 'none';
    setTimeout(() => {
        input.style.animation = 'inputShake 0.5s ease';
    }, 10);
    setTimeout(() => {
        input.style.animation = '';
    }, 500);
}

document.getElementById('deviceIdInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('deviceIdSubmit').click();
    }
});

// Radius selection
const radiusCards = document.querySelectorAll('.radius-card');
const customRadiusInput = document.getElementById('customRadius');

radiusCards.forEach(card => {
    card.addEventListener('click', () => {
        radiusCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedRadius = parseInt(card.dataset.radius);
        customRadiusInput.value = '';
    });
});

customRadiusInput.addEventListener('input', () => {
    radiusCards.forEach(c => c.classList.remove('selected'));
    const value = parseInt(customRadiusInput.value);
    if (value >= 100 && value <= 10000) {
        selectedRadius = value;
    } else {
        selectedRadius = null;
    }
});

// Submit button
document.getElementById('submitBtn').addEventListener('click', () => {
    if (!selectedRadius || selectedRadius < 100) {
        showToast('Vui lòng chọn bán kính hợp lệ (100m - 10,000m)');
        return;
    }

    document.getElementById('selectionScreen').classList.remove('active');
    setTimeout(() => {
        document.getElementById('mapScreen').classList.add('active');
        setTimeout(() => initMap(), 100);
    }, 600);
});

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
    document.getElementById('mapScreen').classList.remove('active');
    
    // Clear all tests and routes
    stopAllTests(true); 
    deleteRoute(true); 

    // Clear additional circles
    additionalCircles.forEach(item => {
        map.removeLayer(item.circle);
        map.removeLayer(item.marker);
    });
    additionalCircles = [];
    updateCirclesList();
    
    setTimeout(() => {
        document.getElementById('selectionScreen').classList.add('active');
    }, 600);
});


// --------------------------------------------------------
// Map Initialization & Circles (Markers)
// --------------------------------------------------------

// Initialize map
function initMap() {
    if (!map) {
        map = L.map('map', {
            zoomControl: true,
            attributionControl: true
        }).setView(locationCoords, 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(map);

        // Right click to add circles
        map.on('contextmenu', (e) => {
            if (additionalCircles.length >= 10) {
                showToast('⚠️ Đã đạt giới hạn 10 vòng tròn!');
                return;
            }
            
            addCircleAtLocation(e.latlng);
        });
    }

    if (marker) map.removeLayer(marker);
    if (circle) map.removeLayer(circle);

    const customIcon = L.divIcon({
        html: '<div style="font-size: 48px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">📍</div>',
        iconSize: [48, 48],
        iconAnchor: [24, 48],
        popupAnchor: [0, -48],
        className: ''
    });

    marker = L.marker(locationCoords, { icon: customIcon }).addTo(map);
    
    const config = window.elementSdk ? window.elementSdk.config : defaultConfig;
    const locationName = config.location_name || defaultConfig.location_name;
    const locationAddress = config.location_address || defaultConfig.location_address;
    
    marker.bindPopup(`
        <div class="popup-header">
            <span>🏫</span>
            <span>${locationName}</span>
        </div>
        <div class="popup-body">${locationAddress}</div>
    `).openPopup();

    circle = L.circle(locationCoords, {
        color: '#10b981',
        fillColor: '#059669',
        fillOpacity: 0.15,
        weight: 3,
        radius: selectedRadius,
        dashArray: '10, 10'
    }).addTo(map);

    map.fitBounds(circle.getBounds(), { padding: [80, 80] });

    const radiusKm = (selectedRadius / 1000).toFixed(2);
    const area = (Math.PI * Math.pow(selectedRadius / 1000, 2)).toFixed(2);
    document.getElementById('radiusDisplay').textContent = selectedRadius >= 1000 ? `${radiusKm} km` : `${selectedRadius} m`;
    document.getElementById('areaDisplay').textContent = `${area} km²`;

    // Hiển thị lại các vòng tròn phụ và tuyến đường cũ nếu có
    additionalCircles.forEach(item => {
        item.circle.addTo(map).setRadius(selectedRadius);
        item.marker.addTo(map);
    });
    if (routePolyline) routePolyline.addTo(map);
    if (routeBuffer) routeBuffer.addTo(map);
    routeMarkers.forEach(m => m.addTo(map));
    updateCirclesList();

    // Đảm bảo nút xóa tuyến đường được hiển thị/ẩn đúng trạng thái
    if (routePoints.length > 0) {
        document.getElementById('deleteRouteBtn').style.display = 'inline-flex';
        document.getElementById('testRouteBtn').style.display = 'inline-flex';
    } else {
        document.getElementById('deleteRouteBtn').style.display = 'none';
        document.getElementById('testRouteBtn').style.display = 'none';
    }
}

function addCircleAtLocation(latlng) {
    const colorIndex = additionalCircles.length % CIRCLE_COLORS.length;
    const color = CIRCLE_COLORS[colorIndex];
    const name = `Vòng tròn ${additionalCircles.length + 1}`;
    
    const newCircle = L.circle(latlng, {
        color: color,
        fillColor: color,
        fillOpacity: 0.15,
        weight: 3,
        radius: selectedRadius,
        dashArray: '10, 10'
    }).addTo(map);

    const circleIcon = L.divIcon({
        html: `<div style="font-size: 32px; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: ''
    });

    const newMarker = L.marker(latlng, { icon: circleIcon }).addTo(map);
    newMarker.bindPopup(`
        <div class="popup-header">
            <span>📍</span>
            <span>${name}</span>
        </div>
        <div class="popup-body">Bán kính: ${selectedRadius}m</div>
    `);

    const circleItem = {
        id: Date.now(),
        name: name,
        radius: selectedRadius,
        latlng: latlng,
        color: color,
        circle: newCircle,
        marker: newMarker
    };

    additionalCircles.push(circleItem);
    updateCirclesList();
    showSuccessToast(`✅ Đã thêm ${name}!`);
}

function updateCirclesList() {
    const panel = document.getElementById('circlesListPanel');
    const list = document.getElementById('circlesList');
    const count = document.getElementById('circleCount');
    
    if (additionalCircles.length > 0) {
        panel.style.display = 'block';
        count.textContent = additionalCircles.length;
        
        list.innerHTML = additionalCircles.map(item => `
            <div class="circle-item">
                <div class="circle-info">
                    <div class="circle-name" style="color: ${item.color};">📍 ${item.name}</div>
                    <div class="circle-radius">Bán kính: ${item.radius}m</div>
                </div>
                <button class="circle-delete" onclick="deleteCircle(${item.id})">Xóa</button>
            </div>
        `).join('');
    } else {
        panel.style.display = 'none';
    }
}

window.deleteCircle = function(id) {
    const index = additionalCircles.findIndex(item => item.id === id);
    if (index !== -1) {
        const item = additionalCircles[index];
        map.removeLayer(item.circle);
        map.removeLayer(item.marker);
        additionalCircles.splice(index, 1);
        updateCirclesList();
        showSuccessToast('✅ Đã xóa vòng tròn!');
    }
};

// --------------------------------------------------------
// Route Drawing & Deletion
// --------------------------------------------------------

// Hàm xóa tuyến đường
window.deleteRoute = function(silent = false) {
    stopAllTests(true); // Dừng test nếu đang chạy

    if (routePolyline) map.removeLayer(routePolyline);
    if (routeBuffer) map.removeLayer(routeBuffer);
    routeMarkers.forEach(m => map.removeLayer(m));
    
    // Reset biến trạng thái
    routePoints = [];
    routePolyline = null;
    routeBuffer = null;
    routeMarkers = [];
    isTestingOffRoute = false; // Reset trạng thái test lệch tuyến

    // Ẩn các nút liên quan và reset text
    document.getElementById('testRouteBtn').style.display = 'none';
    document.getElementById('deleteRouteBtn').style.display = 'none';
    document.getElementById('testRouteBtn').innerHTML = '<span class="button-icon">🚶</span><span>Test Theo Đường</span>'; 

    if (!silent) {
        showSuccessToast('🗑️ Đã xóa tuyến đường!');
    }
};

// Gán sự kiện cho nút Xóa Tuyến Đường (CẦN ĐẢM BẢO NÚT CÓ TRONG HTML)
if (document.getElementById('deleteRouteBtn')) {
    document.getElementById('deleteRouteBtn').addEventListener('click', () => deleteRoute());
}


// Draw route button
document.getElementById('drawRouteBtn').addEventListener('click', () => {
    if (!isDrawingRoute) {
        // Clear old route if exists
        deleteRoute(true); 

        isDrawingRoute = true;
        document.getElementById('drawRouteBtn').classList.add('active');
        document.getElementById('drawRouteBtn').innerHTML = '<span class="button-icon">✅</span><span>Hoàn thành</span>';
        
        // Ẩn nút Test và Xóa tạm thời trong khi vẽ
        document.getElementById('testRouteBtn').style.display = 'none';
        document.getElementById('deleteRouteBtn').style.display = 'none';

        showToast('📍 Click trên bản đồ để vẽ tuyến đường. Click "Hoàn thành" khi xong.');
        
        map.on('click', onMapClickForRoute);
    } else {
        finishDrawingRoute();
    }
});

function onMapClickForRoute(e) {
    if (!isDrawingRoute) return;
    
    routePoints.push(e.latlng);
    
    const pointIcon = L.divIcon({
        html: `<div style="width: 12px; height: 12px; background: #3b82f6; border: 3px solid white; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        className: ''
    });
    
    // Thêm marker tại vị trí click
    const pointMarker = L.marker(e.latlng, { icon: pointIcon }).addTo(map);
    routeMarkers.push(pointMarker);
    
    // Polyline tạm thời cho tuyến đường đang vẽ
    if (routePoints.length >= 2) {
        if (routePolyline) map.removeLayer(routePolyline);
        
        routePolyline = L.polyline(routePoints, {
            color: '#3b82f6',
            weight: 4,
            opacity: 0.8,
            smoothFactor: 1
        }).addTo(map);
    }
}

function finishDrawingRoute() {
    isDrawingRoute = false;
    map.off('click', onMapClickForRoute);
    document.getElementById('drawRouteBtn').classList.remove('active');
    document.getElementById('drawRouteBtn').innerHTML = '<span class="button-icon">✏️</span><span>Vẽ tuyến đường</span>';
    
    if (routePoints.length < 2) {
        showToast('⚠️ Cần ít nhất 2 điểm để tạo tuyến đường!');
        deleteRoute(true); 
        return;
    }
    
    // 1. Create Final Polyline
    if (routePolyline) map.removeLayer(routePolyline);
    routePolyline = L.polyline(routePoints, {
        color: '#f59e0b', 
        weight: 5,
        opacity: 0.9,
        smoothFactor: 1
    }).addTo(map);

    // 2. Create Buffer Zone (Vùng an toàn 100m)
    const bufferDistance = 100; 
    
    const bufferLatLngs = [];
    routePoints.forEach(point => {
        const bufferCircle = createCirclePoints(point, bufferDistance, 16);
        bufferLatLngs.push(...bufferCircle);
    });
    
    if (routeBuffer) map.removeLayer(routeBuffer);
    routeBuffer = L.polygon(bufferLatLngs, {
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.1,
        weight: 2,
        dashArray: '5, 5'
    }).addTo(map);

    showSuccessToast('✅ Đã tạo tuyến đường với vùng an toàn 100m!');
    
    // Hiện nút Xóa tuyến đường và Test
    document.getElementById('deleteRouteBtn').style.display = 'inline-flex';
    document.getElementById('testRouteBtn').style.display = 'inline-flex';
}

function createCirclePoints(center, radius, numPoints) {
    const points = [];
    for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * 2 * Math.PI;
        const lat = center.lat + (radius / 111320) * Math.cos(angle);
        const lng = center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
        points.push([lat, lng]);
    }
    return points;
}

// --------------------------------------------------------
// Test Functions (Đi Đúng/Sai Tuyến, Ở Lâu, Xâm Nhập)
// --------------------------------------------------------

// Check if point is in polygon (for route buffer)
function isPointInPolygon(point, polygon) {
    let inside = false;
    // Lấy tọa độ LatLngs từ L.Polygon (polygon.getLatLngs()[0] là mảng LatLng objects)
    const polygonCoords = polygon.map(ll => ({ lat: ll.lat, lng: ll.lng }));
    
    for (let i = 0, j = polygonCoords.length - 1; i < polygonCoords.length; j = i++) {
        const xi = polygonCoords[i].lat, yi = polygonCoords[i].lng;
        const xj = polygonCoords[j].lat, yj = polygonCoords[j].lng;
        
        const intersect = ((yi > point.lng) !== (yj > point.lng))
             && (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}


// Test route following button
document.getElementById('testRouteBtn').addEventListener('click', () => {
    // Chuyển đổi trạng thái giữa đi đúng và đi sai tuyến
    isTestingOffRoute = !isTestingOffRoute;
    const btn = document.getElementById('testRouteBtn');
    
    if (isTestingOffRoute) {
        btn.innerHTML = '<span class="button-icon">⚠️</span><span>Test Sai Tuyến</span>';
        showToast('Bắt đầu Test: Sẽ cố tình **đi lệch tuyến** để kích hoạt cảnh báo!');
    } else {
        btn.innerHTML = '<span class="button-icon">🚶</span><span>Test Theo Đường</span>';
        showToast('Bắt đầu Test: Sẽ **đi đúng tuyến đường** đã vẽ.');
    }
    
    stopAllTests(); // Dừng test cũ
    testRouteFollowing();
});

function testRouteFollowing() {
    if (routePoints.length < 2) {
        showToast('⚠️ Vui lòng vẽ tuyến đường trước!');
        document.getElementById('testRouteBtn').style.display = 'none';
        return;
    }
    if (!routeBuffer) {
        showToast('⚠️ Tuyến đường chưa có vùng an toàn!');
        return;
    }

    document.getElementById('stopTestsBtn').style.display = 'flex'; 
    
    // Icon mặc định (Đi đúng đường)
    const defaultIcon = L.divIcon({
        html: `<div style="font-size: 32px; filter: drop-shadow(0 4px 8px rgba(59,130,246,0.5));">🚶</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: ''
    });

    // Icon cảnh báo (Lệch đường)
    const alertIcon = L.divIcon({
        html: `<div style="font-size: 32px; filter: drop-shadow(0 4px 8px rgba(239,68,68,0.5));">🚨</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        className: ''
    });
    
    testMarkerForRoute = L.marker(routePoints[0], { icon: defaultIcon }).addTo(map); 
    
    let currentIndex = 0;
    const totalSteps = 200;
    let step = 0;
    let offRouteDetected = false;
    
    routeInterval = setInterval(() => { 
        step++;
        
        if (currentIndex >= routePoints.length - 1) {
            clearInterval(routeInterval);
            routeInterval = null;
            map.removeLayer(testMarkerForRoute);
            testMarkerForRoute = null;
            document.getElementById('stopTestsBtn').style.display = 'none';
            if (!offRouteDetected) {
                showSuccessToast('✅ Hoàn thành! Đi đúng tuyến đường!');
            }
            return;
        }
        
        const progress = (step % (totalSteps / (routePoints.length - 1))) / (totalSteps / (routePoints.length - 1));
        
        if (progress >= 1) {
            currentIndex++;
            step = 0;
        }
        
        if (currentIndex < routePoints.length - 1) {
            const start = routePoints[currentIndex];
            const end = routePoints[currentIndex + 1];
            const lat = start.lat + (end.lat - start.lat) * progress;
            const lng = start.lng + (end.lng - start.lng) * progress;
            
            let finalLat = lat;
            let finalLng = lng;
            
            // LOGIC ĐI LỆCH TUYẾN (CỐ TÌNH RẼ RA KHỎI ĐƯỜNG)
            if (isTestingOffRoute && !offRouteDetected && step > 50) { 
                const deviation = 150 / 111320; // Lệch 150m (đủ để ra khỏi buffer 100m)
                finalLat += (Math.random() - 0.5) * deviation * 3; 
                finalLng += (Math.random() - 0.5) * deviation * 3;
            } 
            // LOGIC ĐI ĐÚNG TUYẾN (ĐI THẲNG TRÊN ĐƯỜNG)
            else if (!isTestingOffRoute) {
                const jitter = 5 / 111320; // Jitter nhỏ 5m (vẫn trong buffer)
                finalLat += (Math.random() - 0.5) * jitter;
                finalLng += (Math.random() - 0.5) * jitter;
            }

            const point = L.latLng(finalLat, finalLng);
            
            // Kiểm tra và Cảnh báo
            const bufferLatLngsArray = routeBuffer.getLatLngs()[0];
            if (!offRouteDetected && !isPointInPolygon(point, bufferLatLngsArray)) {
                offRouteDetected = true;
                showAlert('⚠️ CẢNH BÁO LỆCH ĐƯỜNG!', 'Phát hiện di chuyển ra ngoài tuyến đường an toàn!');
                testMarkerForRoute.setIcon(alertIcon);
            }
            
            testMarkerForRoute.setLatLng([finalLat, finalLng]); 
        }
    }, 30);
}

// Test stay long button
document.getElementById('testStayBtn').addEventListener('click', () => {
    stopAllTests(); 
    testStayLong();
});

function testStayLong() {
    if (testInterval) {
        showToast('Kiểm tra đang chạy, vui lòng đợi!');
        return;
    }

    showToast('Đang mô phỏng đứng 60 phút...');

    // Sau 2 giây sẽ hiện cảnh báo và bắn email
    setTimeout(() => {
        // Hiển thị giao diện cảnh báo trên bản đồ
        showAlert('🚨 CẢNH BÁO Ở LÂU!', 'Phát hiện ở cùng 1 vị trí quá 60 phút sau 17h!');

        // GỌI HÀM GỬI EMAIL TỪ NOTIFICATION.JS
        if (typeof sendRealAlertEmail === "function") {
            sendRealAlertEmail('STAY_LONG');
            console.log("Đã kích hoạt gửi mail đứng lâu.");
        }
    }, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    const btnStayLong = document.getElementById('testStayLongBtn');
    if (btnStayLong) {
        btnStayLong.onclick = testStayLong;
    }
});

// Test intrusion button
document.getElementById('testIntrusionBtn').addEventListener('click', () => {
    stopAllTests(); 
    testIntrusion();
});

function testIntrusion() {
    if (testInterval) {
        showToast('Kiểm tra đang chạy, vui lòng đợi!');
        return;
    }

    document.getElementById('stopTestsBtn').style.display = 'flex'; 
    
    testMarkers.forEach(m => map.removeLayer(m));
    testMarkers = [];

    const numMarkers = 3;
    const startPositions = [];
    
    for (let i = 0; i < numMarkers; i++) {
        const angle = (Math.PI * 2 * i) / numMarkers;
        const distance = selectedRadius * 0.3;
        const lat = locationCoords[0] + (distance / 111320) * Math.cos(angle);
        const lng = locationCoords[1] + (distance / (111320 * Math.cos(locationCoords[0] * Math.PI / 180))) * Math.sin(angle);
        startPositions.push([lat, lng]);
    }

    startPositions.forEach((pos, index) => {
        const icon = L.divIcon({
            html: `<div style="font-size: 32px; filter: drop-shadow(0 4px 8px rgba(239,68,68,0.5));">🚨</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
            className: ''
        });
        
        const testMarker = L.marker(pos, { icon: icon }).addTo(map);
        testMarkers.push({ marker: testMarker, angle: (Math.PI * 2 * index) / numMarkers, distance: selectedRadius * 0.3 });
    });

    let step = 0;
    const maxSteps = 100;
    const alertTriggered = { value: false };

    testInterval = setInterval(() => { 
        step++;
        const progress = step / maxSteps;
        
        testMarkers.forEach((item) => {
            const angle = item.angle;
            const newDistance = selectedRadius * 0.3 + (selectedRadius * 0.9 * progress); 
            const lat = locationCoords[0] + (newDistance / 111320) * Math.cos(angle);
            const lng = locationCoords[1] + (newDistance / (111320 * Math.cos(locationCoords[0] * Math.PI / 180))) * Math.sin(angle);
            
            item.marker.setLatLng([lat, lng]);
            item.distance = newDistance;

            // KIỂM TRA ĐIỀU KIỆN RA KHỎI VÙNG AN TOÀN
            if (!alertTriggered.value && newDistance > selectedRadius) {
                alertTriggered.value = true;
                
                // 1. Hiện thông báo trên giao diện Web
                showAlert('⚠️ CẢNH BÁO XÂM NHẬP!', 'Phát hiện đối tượng di chuyển ra ngoài vùng an toàn!');
                
                // 2. GỬI EMAIL THỰC TẾ (Gọi sang notification.js)
                if (typeof sendRealAlertEmail === "function") {
                    sendRealAlertEmail('OUT_OF_ZONE');
                }
            }
        });

        if (step >= maxSteps) {
            clearInterval(testInterval);
            testInterval = null;
            document.getElementById('stopTestsBtn').style.display = 'none'; 
            
            setTimeout(() => {
                testMarkers.forEach(item => {
                    if (item.marker) map.removeLayer(item.marker);
                });
                testMarkers = [];
            }, 2000);
        }
    }, 30);
}