// Các mã số từ Dashboard của bạn
const EMAILJS_PUBLIC_KEY = "4cvVLEjXS7gDEgoOT"; 
const EMAILJS_SERVICE_ID = "service_xyowmff"; 

// Khai báo 2 Template ID riêng biệt
const TEMPLATE_STAY_LONG = "template_zdsevir"; // Cho Đứng Lâu
const TEMPLATE_INTRUSION = "template_x17q06i"; // Thay mã mới vào đây

function sendRealAlertEmail(type) {
    // Khởi tạo Public Key
    emailjs.init(EMAILJS_PUBLIC_KEY);

    let targetTemplateID = "";
    
    // CHỌN TEMPLATE DỰA TRÊN NÚT BẤM
    if (type === 'STAY_LONG') {
        targetTemplateID = TEMPLATE_STAY_LONG;
        console.log("📨 Đang dùng Template Đứng Lâu...");
    } 
    else if (type === 'OUT_OF_ZONE') {
        targetTemplateID = TEMPLATE_INTRUSION;
        console.log("📨 Đang dùng Template Xâm Nhập...");
    }

    const templateParams = {
        to_email: "trandoanbao2009@gmail.com" //
    };

    // Gửi đúng Template đã chọn về Gmail
    emailjs.send(EMAILJS_SERVICE_ID, targetTemplateID, templateParams)
        .then(function(response) {
            console.log('🚀 GỬI THÀNH CÔNG ĐÚNG MẪU!', response.status);
        }, function(error) {
            console.error('❌ LỖI:', error);
        });
}