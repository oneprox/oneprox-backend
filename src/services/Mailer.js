const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Helper function to get logo file path
function getLogoPath() {
  // __dirname is src/services, so go up 2 levels to project root, then into icon folder
  const logoFileName = process.env.LOGO_FILENAME || 'peruri-property.jpeg';
  return path.join(__dirname, '../../icon', logoFileName);
}

// Helper function to get logo attachment config
function getLogoAttachment(cid) {
  const logoPath = getLogoPath();
  if (!fs.existsSync(logoPath)) {
    console.warn('Logo file not found at:', logoPath);
    return null;
  }
  const logoFileName = process.env.LOGO_FILENAME || 'peruri-property.jpeg';
  const fileExtension = path.extname(logoFileName).toLowerCase();
  const contentType = fileExtension === '.png' ? 'image/png' : 
                      fileExtension === '.svg' ? 'image/svg+xml' : 
                      'image/jpeg';
  
  return {
    filename: logoFileName,
    path: logoPath,
    cid: cid,
    contentType: contentType
  };
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function createTransportFromEnv() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.MAIL_FROM;

  if (!host || !user || !pass || !from) {
    throw new Error('SMTP config missing. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM');
  }

  const transport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  return { transport, from };
}

async function sendPasswordResetEmail({ to, resetUrl, userName = 'Pengguna' }) {
  const { transport, from } = createTransportFromEnv();
  const logoCid = 'logo@peruriproperty';
  const logoAttachment = getLogoAttachment(logoCid);
  const safeResetUrl = escapeHtmlAttr(resetUrl);
  const safeUserName = escapeHtmlText(userName);

  // Plain text version for email clients that don't support HTML
  const text =
    `Reset Password Anda\n\n` +
    `Hi ${userName},\n\n` +
    `Kami menerima sebuah permintaan untuk reset password Anda.\n\n` +
    `Klik link berikut untuk mereset password Anda:\n${resetUrl}\n\n` +
    `Link akan kadaluarsa dalam 30 menit. Jika Anda tidak melakukan permintaan ini harap abaikan pesan ini dan jangan melakukan reset password.\n\n` +
    `Email ini dikirim secara otomatis, mohon tidak membalas email ini.\n\n` +
    `© 2025 PT Peruri Property. All rights reserved.`;

  // HTML email template matching Figma design
  const html = `
    <!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Password - PERURI PROPERTY</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F8F9FA;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #F8F9FA; padding: 20px 0;">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <!-- Logo Section -->
          <tr>
            <td style="padding: 20px 40px; text-align: left; background-color: #ffffff; border-radius: 8px 8px 0 0;">
              <img src="cid:${logoCid}" alt="PERURI PROPERTY" style="max-width: 150px; height: auto; display: block;" />
            </td>
          </tr>
          
          <!-- Blue Header Bar with Title -->
          <tr>
            <td style="padding: 20px 40px; background-color: #2F70FF; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">Reset Password</h1>
            </td>
          </tr>
          
          <!-- Main Content Section -->
          <tr>
            <td style="padding: 40px 40px 30px; background-color: #ffffff;">
              <!-- Greeting -->
              <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1a1a1a; line-height: 1.5;">Hi ${safeUserName},</p>
              
              <!-- Instruction Text -->
              <p style="margin: 0 0 32px; font-size: 16px; line-height: 1.6; color: #1a1a1a;">
                Kami menerima sebuah permintaan untuk reset password Anda.
              </p>
              
              <!-- Reset Password Button -->
              <table role="presentation" style="width: 100%; margin: 0 0 32px;">
                <tr>
                  <td align="center" style="padding: 0;">
                    <a href="${safeResetUrl}" style="display: inline-block; padding: 14px 40px; background-color: #2F70FF; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; text-align: center;">Reset Password</a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 32px; font-size: 14px; line-height: 1.6; color: #4b5563; word-break: break-all;">
                Jika tombol tidak berfungsi, salin dan buka link berikut di browser Anda:<br />
                <a href="${safeResetUrl}" style="color: #2F70FF; text-decoration: underline;">${safeResetUrl}</a>
              </p>
              
              <!-- Expiration Notice -->
              <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #1a1a1a;">
                Link akan kadaluarsa dalam <strong style="font-weight: 700;">30 menit</strong>. Jika Anda tidak melakukan permintaan ini harap abaikan pesan ini dan jangan melakukan reset password.
              </p>
            </td>
          </tr>
          
          <!-- Footer Section -->
          <tr>
            <td style="padding: 30px 40px; background-color: #f3f4f6; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0 0 12px; font-size: 14px; color: #6b7280; line-height: 1.6;">
                Email ini dikirim secara otomatis, mohon tidak membalas email ini.
              </p>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                © 2025 PT Peruri Property. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>


  `;

  const mailOptions = {
    from,
    to,
    subject: 'Reset Password - PERURI PROPERTY',
    text,
    html
  };

  if (logoAttachment) {
    mailOptions.attachments = [logoAttachment];
  }

  await transport.sendMail(mailOptions);
}

async function sendTenantPaymentDueSoonEmail({ to, tenantName, tenantCode, paymentId, amount, deadline, daysLeft }) {
  const { transport, from } = createTransportFromEnv();
  const logoCid = 'logo@peruriproperty';
  const logoAttachment = getLogoAttachment(logoCid);
  const subject = `Pengingat Pembayaran: tersisa ${daysLeft} hari`;

  const safeTenant = tenantName || tenantCode || 'Tenant';
  const safeAmount = amount != null ? Number(amount) : 0;

  // Format date to Indonesian format (e.g., "29 Desember 2025")
  const formatIndonesianDate = (date) => {
    if (!date) return '-';
    const d = new Date(date);
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  };

  // Format amount to Indonesian Rupiah format (e.g., "Rp10.000.000")
  const formatRupiah = (num) => {
    if (num == null || isNaN(num)) return 'Rp0';
    return 'Rp' + Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const deadlineStr = formatIndonesianDate(deadline);
  const formattedAmount = formatRupiah(safeAmount);

  // Payment instructions and contact info from environment variables
  const bankAccount = process.env.PAYMENT_BANK_ACCOUNT || '1234567890';
  const bankAccountName = process.env.PAYMENT_BANK_ACCOUNT_NAME || 'PT Peruri Property';
  const paymentEmail = process.env.PAYMENT_EMAIL || 'payment@peruriproperty.com';
  const supportEmail = process.env.SUPPORT_EMAIL || 'support@peruriproperty.com';
  const supportPhone = process.env.SUPPORT_PHONE || '+62 21 1234 5678';

  const text =
    `Halo ${safeTenant},\n\n` +
    `Kami ingin mengingatkan Anda mengenai pembayaran sewa yang akan jatuh tempo.\n\n` +
    `Tanggal Jatuh Tempo: ${deadlineStr}\n` +
    `Nominal yang harus dibayar: ${formattedAmount}\n` +
    `ID Pembayaran: ${paymentId}\n\n` +
    `Cara Pembayaran:\n` +
    `1. Transfer ke rekening perusahaan: ${bankAccount} a.n ${bankAccountName}\n` +
    `2. Gunakan ID Pembayaran sebagai berita acara transfer\n` +
    `3. Kirim bukti transfer ke email: ${paymentEmail}\n\n` +
    `Jika Anda memiliki pertanyaan, silakan hubungi tim kami di:\n` +
    `Email: ${supportEmail}\n` +
    `Telepon: ${supportPhone}\n\n` +
    `Terima kasih.`;

  // HTML email template matching the design (table-based for email client compatibility)
  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Reminder - PERURI PROPERTY</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
      <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f5f5f5; padding: 20px 0;">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <table role="presentation" style="width: 100%; max-width: 600px; background-color: #ffffff; border-collapse: collapse;">
              <!-- Header -->
              <tr>
                <td style="padding: 20px 40px; background-color: #ffffff; text-align: left;">
                  <img src="cid:${logoCid}" alt="PERURI PROPERTY" style="max-width: 150px; height: auto; display: block;" />
                </td>
              </tr>

              <!-- Main Content (Blue Background) -->
              <tr>
                <td style="padding: 40px; background-color: #2563eb;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 0 0 16px;">
                        <div style="font-size: 24px; font-weight: bold; color: #ffffff; line-height: 1.3;">Hi ${safeTenant},</div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 0 30px 0;">
                        <div style="font-size: 16px; color: #ffffff; line-height: 1.5; padding-right: 20px;">
                          Kami ingin mengingatkan Anda mengenai pembayaran sewa yang akan jatuh tempo.
                        </div>
                      </td>
                    </tr>
                    
                    <!-- Payment Details Card (White Card) -->
                    <tr>
                      <td style="padding: 0;">
                        <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border-radius: 12px;">
                          <tr>
                            <td style="padding: 30px;">
                              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                <!-- Due Date Row -->
                                <tr>
                                  <td style="padding: 0 0 20px; border-bottom: 1px solid #e5e7eb;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                      <tr>
                                        <td style="padding: 0; vertical-align: middle;">
                                          <span style="font-size: 14px; color: #6b7280;">Tanggal Jatuh Tempo</span>
                                        </td>
                                        <td style="padding: 0; text-align: right; vertical-align: middle;">
                                          <span style="font-size: 16px; font-weight: bold; color: #1a365d;">${deadlineStr}</span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Payment ID Row -->
                                <tr>
                                  <td style="padding: 0 0 20px; border-bottom: 1px solid #e5e7eb;">
                                    <table role="presentation" style="width: 100%; border-collapse: collapse;">
                                      <tr>
                                        <td style="padding: 0; vertical-align: middle;">
                                          <span style="font-size: 14px; color: #6b7280;">ID Pembayaran</span>
                                        </td>
                                        <td style="padding: 0; text-align: right; vertical-align: middle;">
                                          <span style="font-size: 16px; font-weight: bold; color: #1a365d;">${paymentId}</span>
                                        </td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                
                                <!-- Amount Section -->
                                <tr>
                                  <td style="padding: 20px 0; border-bottom: 1px solid #e5e7eb; text-align: center;">
                                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">Nominal yang harus dibayar</div>
                                    <div style="font-size: 36px; font-weight: bold; color: #2563eb; line-height: 1.2;">${formattedAmount}</div>
                                  </td>
                                </tr>
                                
                                <!-- Payment Note -->
                                <tr>
                                  <td style="padding: 20px 0 0; text-align: center;">
                                    <div style="font-size: 12px; color: #6b7280; line-height: 1.6;">
                                      Harap dibayar sebelum tanggal jatuh tempo
                                    </div>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Payment Instructions Section -->
              <tr>
                <td style="padding: 40px; background-color: #ffffff;">
                  <div style="font-size: 18px; font-weight: bold; color: #1a365d; margin-bottom: 24px;">Cara Pembayaran:</div>
                  
                  <table role="presentation" style="width: 100%; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 0 0 20px; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="padding: 0 16px 0 0; vertical-align: top;">
                              <table role="presentation" style="width: 32px; height: 32px; background-color: #2563eb; border-radius: 50%; border-collapse: collapse;">
                                <tr>
                                  <td style="text-align: center; vertical-align: middle; padding: 0; height: 32px; width: 32px;">
                                    <span style="font-size: 14px; font-weight: bold; color: #ffffff; line-height: 1;">1</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td style="padding: 0; vertical-align: top;">
                              <div style="font-size: 14px; color: #374151; line-height: 1.6;">
                                Transfer ke rekening perusahaan: <strong>${bankAccount}</strong> a.n ${bankAccountName}
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 0 20px; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="padding: 0 16px 0 0; vertical-align: top;">
                              <table role="presentation" style="width: 32px; height: 32px; background-color: #2563eb; border-radius: 50%; border-collapse: collapse;">
                                <tr>
                                  <td style="text-align: center; vertical-align: middle; padding: 0; height: 32px; width: 32px;">
                                    <span style="font-size: 14px; font-weight: bold; color: #ffffff; line-height: 1;">2</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td style="padding: 0; vertical-align: top;">
                              <div style="font-size: 14px; color: #374151; line-height: 1.6;">
                                Gunakan ID Pembayaran sebagai berita acara transfer
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0; vertical-align: top;">
                        <table role="presentation" style="border-collapse: collapse;">
                          <tr>
                            <td style="padding: 0 16px 0 0; vertical-align: top;">
                              <table role="presentation" style="width: 32px; height: 32px; background-color: #2563eb; border-radius: 50%; border-collapse: collapse;">
                                <tr>
                                  <td style="text-align: center; vertical-align: middle; padding: 0; height: 32px; width: 32px;">
                                    <span style="font-size: 14px; font-weight: bold; color: #ffffff; line-height: 1;">3</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                            <td style="padding: 0; vertical-align: top;">
                              <div style="font-size: 14px; color: #374151; line-height: 1.6;">
                                Kirim bukti transfer ke email: <a href="mailto:${paymentEmail}" style="color: #2563eb; text-decoration: none;">${paymentEmail}</a>
                              </div>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Contact Information Section -->
              <tr>
                <td style="padding: 0 40px 40px;">
                  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 30px;">
                    <tr>
                      <td style="padding: 0 0 20px;">
                        <div style="font-size: 14px; color: #374151; line-height: 1.6;">
                          Jika Anda memiliki pertanyaan, silakan hubungi tim kami di:
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0 0 12px;">
                        <a href="mailto:${supportEmail}" style="font-size: 14px; color: #2563eb; text-decoration: none;">${supportEmail}</a>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 0;">
                        <span style="font-size: 14px; color: #2563eb;">${supportPhone}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Footer Section -->
              <tr>
                <td style="padding: 30px 40px; background-color: #f3f4f6; text-align: center;">
                  <div style="font-size: 12px; color: #6b7280; line-height: 1.8;">
                    Email ini dikirim secara otomatis, mohon tidak membalas email ini.<br>
                    © 2025 PT Peruri Property. All rights reserved.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const mailOptions = {
    from,
    to,
    subject,
    text,
    html
  };

  if (logoAttachment) {
    mailOptions.attachments = [logoAttachment];
  }

  await transport.sendMail(mailOptions);
}

module.exports = { sendPasswordResetEmail, sendTenantPaymentDueSoonEmail };


