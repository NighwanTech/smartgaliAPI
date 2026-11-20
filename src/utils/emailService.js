import nodemailer from 'nodemailer';

let transporter;

/**
 * Creates a reusable Nodemailer transporter from environment variables.
 * Supports Gmail, Outlook, or any custom SMTP host.
 */
const createTransporter = () => {
  const requiredVariables = ['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'];
  const missingVariables = requiredVariables.filter(
    (name) => !process.env[name]?.trim()
  );
  if (missingVariables.length > 0) {
    const error = new Error(
      `Email service is not configured. Missing: ${missingVariables.join(', ')}`
    );
    error.statusCode = 503;
    throw error;
  }

  const port = parseInt(process.env.EMAIL_PORT || '587');
  if (!Number.isInteger(port) || port <= 0) {
    const error = new Error('Email service has an invalid EMAIL_PORT.');
    error.statusCode = 503;
    throw error;
  }

  const isSSL = port === 465; // port 465 = SSL/SMTPS, port 587 = STARTTLS

  return nodemailer.createTransport({
    host:       process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:       port,
    secure:     isSSL,         // true only for port 465
    requireTLS: !isSSL,        // force STARTTLS upgrade on port 587 — never send plain-text
    connectionTimeout: 30000,  // increased for Render cold-start latency
    greetingTimeout:  20000,
    socketTimeout:    45000,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      // Allow self-signed certs on some Hostinger SMTP nodes;
      // remove this line if your cert chain is fully valid
      rejectUnauthorized: false,
    },
  });
};

/**
 * Sends a branded OTP email to the recipient.
 * @param {string} toEmail - The recipient's email address
 * @param {string} otp     - The 6-digit OTP code
 */
export const sendOtpEmail = async (toEmail, otp) => {
  const isDevMode = process.env.NODE_ENV === 'development';
  const isDummyHost =
    !process.env.EMAIL_HOST ||
    process.env.EMAIL_HOST === 'smtp.example.com' ||
    process.env.EMAIL_PASS === 'replace_with_smtp_password';

  if (isDevMode && isDummyHost) {
    console.log('\n======================================================');
    console.log('[DEV OTP BYPASS] No SMTP configured. Mocking OTP delivery.');
    console.log('[DEV OTP CODE] Verification code for ' + toEmail + ': ' + otp);
    console.log('======================================================\n');
    return { accepted: [toEmail], messageId: 'mock-dev-otp', devOtp: otp };
  }
  // Lazy-init: create transporter only once, reset on failure
  if (!transporter) {
    transporter = createTransporter();
  }
  const t = transporter;

  const mailOptions = {
    from:    `"SmartGalli" <${process.env.EMAIL_USER}>`,
    to:      toEmail,
    subject: '🔐 Your SmartGalli Verification Code',
    text: `Your SmartGalli verification code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>SmartGalli OTP</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f7f6;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f6;padding:40px 20px;">
          <tr>
            <td align="center">
              <table width="520" cellpadding="0" cellspacing="0"
                     style="background:#ffffff;border-radius:16px;overflow:hidden;
                            box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg,#FF6B00 0%,#10B981 100%);
                              padding:28px 40px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;
                                letter-spacing:-0.5px;">Smart<span style="color:#fff;">Galli</span></h1>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;">
                      Your Digital Neighborhood
                    </p>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:36px 40px;text-align:center;">
                    <div style="font-size:40px;margin-bottom:16px;">🔐</div>
                    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">
                      Verification Code
                    </h2>
                    <p style="margin:0 0 28px;color:#6B7280;font-size:14px;line-height:1.6;">
                      Use the code below to complete your login.<br/>
                      It expires in <strong>5 minutes</strong>.
                    </p>
                    <!-- OTP Box -->
                    <div style="display:inline-block;background:#f0fdf8;border:2px dashed #10B981;
                                border-radius:12px;padding:18px 40px;margin-bottom:28px;">
                      <span style="font-size:40px;font-weight:800;letter-spacing:10px;
                                   color:#10B981;font-family:'Courier New',monospace;">
                        ${otp}
                      </span>
                    </div>
                    <p style="margin:0 0 8px;color:#9CA3AF;font-size:12px;">
                      If you did not request this, please ignore this email.
                    </p>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#f9fafb;padding:20px 40px;text-align:center;
                              border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#9CA3AF;font-size:12px;">
                      © ${new Date().getFullYear()} SmartGalli · Secure · Fast · Reliable
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  let info;
  try {
    info = await t.sendMail(mailOptions);
  } catch (sendError) {
    // Reset the cached transporter so the next request gets a fresh connection
    transporter = null;
    // Log full SMTP error details so Render logs show the real cause
    console.error(
      `[EMAIL OTP] sendMail FAILED — code: ${sendError.code || 'N/A'}, ` +
      `errno: ${sendError.errno || 'N/A'}, ` +
      `host: ${process.env.EMAIL_HOST}:${process.env.EMAIL_PORT}, ` +
      `message: ${sendError.message}`
    );
    if (isDevMode) {
      console.log('\n======================================================');
      console.log('[DEV OTP FALLBACK] SMTP failed (' + (sendError.message || 'unknown') + '). Using dev OTP.');
      console.log('[DEV OTP CODE] Verification code for ' + toEmail + ': ' + otp);
      console.log('======================================================\n');
      return { accepted: [toEmail], messageId: 'mock-dev-otp', devOtp: otp };
    }
    const error = new Error('Failed to send OTP email. Please try again in a moment.');
    error.statusCode = 503;
    error.cause = sendError;
    throw error;
  }

  const normalizedRecipient = toEmail.toLowerCase();
  const accepted = (info.accepted || []).some(
    (recipient) => String(recipient).toLowerCase() === normalizedRecipient
  );

  if (!accepted) {
    const error = new Error('The email provider rejected the OTP recipient.');
    error.statusCode = 503;
    throw error;
  }

  console.log(`[EMAIL OTP] Provider accepted message ${info.messageId}`);
  return info;
};

/**
 * Sends an enterprise support ticket email notification.
 * Dispatches:
 *   1. Notification to the official support desk (EMAIL_USER / support@nighwantech.com)
 *   2. Optional receipt email to the user who raised the ticket (if email present)
 *
 * @param {Object} params
 * @param {Object} params.ticket - The newly created SupportTicket record
 * @param {Object} params.user   - The User record of the ticket creator
 */
export const sendSupportTicketEmail = async ({ ticket, user }) => {
  const supportEmail = process.env.EMAIL_USER || 'support@nighwantech.com';
  const userName = user?.userName || user?.fullName || 'SmartGalli User';
  const userPhone = user?.phone || 'Not provided';
  const userEmail = user?.email || null;
  const ticketCategory = ticket?.category || 'General Support';
  const ticketDescription = ticket?.description || 'No description provided';
  const ticketId = ticket?.id || 'N/A';
  const createdAt = ticket?.created_at ? new Date(ticket.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Lazy-init transporter
  if (!transporter) {
    transporter = createTransporter();
  }
  const t = transporter;

  // 1. Dispatch Email to Support Desk
  const adminMailOptions = {
    from: `"SmartGalli HelpDesk" <${supportEmail}>`,
    to: supportEmail,
    replyTo: userEmail || supportEmail,
    subject: `🎫 [New Support Ticket #${ticketId}] ${ticketCategory} - ${userName}`,
    text: `New Support Ticket #${ticketId}\nCategory: ${ticketCategory}\nUser: ${userName} (Phone: ${userPhone}, Email: ${userEmail || 'N/A'})\nTime: ${createdAt}\n\nDescription:\n${ticketDescription}`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>New Support Ticket #${ticketId}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:30px 15px;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.06);">
                <!-- Header -->
                <tr>
                  <td style="background:linear-gradient(135deg, #111827 0%, #1F2937 100%);padding:24px 32px;border-bottom:3px solid #FF6B00;">
                    <table width="100%">
                      <tr>
                        <td>
                          <h2 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Smart<span style="color:#FF6B00;">Galli</span> HelpDesk</h2>
                          <p style="margin:4px 0 0;color:#9CA3AF;font-size:12px;">New User Support Request Received</p>
                        </td>
                        <td align="right">
                          <span style="background:#FF6B00;color:#ffffff;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700;">Ticket #${ticketId}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Body -->
                <tr>
                  <td style="padding:28px 32px;">
                    <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
                      <table width="100%" style="font-size:14px;color:#374151;">
                        <tr>
                          <td style="padding:6px 0;color:#6B7280;width:120px;"><strong>Category:</strong></td>
                          <td style="padding:6px 0;font-weight:600;color:#111827;">${ticketCategory}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#6B7280;"><strong>User Name:</strong></td>
                          <td style="padding:6px 0;font-weight:600;color:#111827;">${userName}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#6B7280;"><strong>Phone:</strong></td>
                          <td style="padding:6px 0;"><a href="tel:${userPhone}" style="color:#2563EB;text-decoration:none;">${userPhone}</a></td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#6B7280;"><strong>Email:</strong></td>
                          <td style="padding:6px 0;">${userEmail ? `<a href="mailto:${userEmail}" style="color:#2563EB;text-decoration:none;">${userEmail}</a>` : '<span style="color:#9CA3AF;">None</span>'}</td>
                        </tr>
                        <tr>
                          <td style="padding:6px 0;color:#6B7280;"><strong>Submitted:</strong></td>
                          <td style="padding:6px 0;color:#4B5563;">${createdAt}</td>
                        </tr>
                      </table>
                    </div>

                    <h3 style="margin:0 0 10px;font-size:15px;color:#111827;">Issue Description:</h3>
                    <div style="background:#ffffff;border-left:4px solid #10B981;border-top:1px solid #E5E7EB;border-right:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;border-radius:4px;padding:16px 18px;color:#1F2937;font-size:14px;line-height:1.6;white-space:pre-wrap;">${ticketDescription}</div>

                    <div style="margin-top:24px;padding-top:16px;border-top:1px dashed #E5E7EB;font-size:12px;color:#6B7280;">
                      <em>💡 Tip: You can reply directly to this email to contact the user at their registered email (${userEmail || 'none'}).</em>
                    </div>
                  </td>
                </tr>
                <!-- Footer -->
                <tr>
                  <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;text-align:center;font-size:12px;color:#9CA3AF;">
                    SmartGalli Platform Support · Auto-generated notification
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `,
  };

  const results = {};
  try {
    results.adminMail = await t.sendMail(adminMailOptions);
    console.log(`[SUPPORT TICKET] Support desk notification email sent for ticket #${ticketId}: ${results.adminMail.messageId}`);
  } catch (err) {
    console.error(`[SUPPORT TICKET] Failed to send support desk email for ticket #${ticketId}:`, err.message);
  }

  // 2. Dispatch Confirmation Email to User (if user has an email)
  if (userEmail && userEmail.includes('@')) {
    const userMailOptions = {
      from: `"SmartGalli Support" <${supportEmail}>`,
      to: userEmail,
      subject: `✅ Ticket #${ticketId} Received - SmartGalli Support`,
      text: `Hello ${userName},\n\nWe have received your support request (Ticket #${ticketId}) regarding "${ticketCategory}".\n\nOur team is reviewing your message and will respond as soon as possible.\n\nDescription:\n${ticketDescription}\n\nThank you,\nSmartGalli Support Team`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8"/>
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        </head>
        <body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 15px;">
            <tr>
              <td align="center">
                <table width="540" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #E5E7EB;overflow:hidden;">
                  <tr>
                    <td style="background:#10B981;padding:20px 28px;text-align:center;color:#ffffff;">
                      <h2 style="margin:0;font-size:20px;font-weight:700;">Support Request Received</h2>
                      <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Ticket #${ticketId}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:28px;">
                      <p style="margin:0 0 16px;color:#1F2937;font-size:15px;">Hi <strong>${userName}</strong>,</p>
                      <p style="margin:0 0 20px;color:#4B5563;font-size:14px;line-height:1.6;">
                        Thank you for reaching out. We have registered your support ticket under category <strong>${ticketCategory}</strong>. Our team is actively reviewing your query and will assist you shortly.
                      </p>
                      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px;color:#374151;">
                        <strong>Your Message:</strong><br/>
                        <span style="color:#6B7280;white-space:pre-wrap;">${ticketDescription}</span>
                      </div>
                      <p style="margin:0;color:#9CA3AF;font-size:12px;">
                        Need urgent assistance? You can also reach us via the in-app WhatsApp support chat.
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="background:#F3F4F6;padding:12px;text-align:center;font-size:12px;color:#6B7280;">
                      © ${new Date().getFullYear()} SmartGalli · All rights reserved
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    };
    try {
      results.userMail = await t.sendMail(userMailOptions);
      console.log(`[SUPPORT TICKET] User confirmation email sent for ticket #${ticketId}: ${results.userMail.messageId}`);
    } catch (err) {
      console.error(`[SUPPORT TICKET] Failed to send user confirmation email for ticket #${ticketId}:`, err.message);
    }
  }

  return results;
};
