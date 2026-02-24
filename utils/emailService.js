import nodemailer from 'nodemailer';

// Note: IPv4 DNS is forced via --dns-result-order=ipv4first in package.json start script

// Create transporter
const createTransporter = async () => {
  // For production: Use real email service (Gmail, SendGrid, etc.)
  if (process.env.NODE_ENV === 'production' && process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  } else {
    // Development: Use Ethereal test account
    const testAccount = await nodemailer.createTestAccount();
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass
      }
    });
  }
};

// Send verification email with OTP
export const sendVerificationEmail = async (email, name, otp) => {
  try {
    const transporter = await createTransporter();
    
    console.log('\n📧 =================================');
    console.log('📧 SENDING OTP VERIFICATION EMAIL');
    console.log('📧 =================================');
    console.log('   To:', email);
    console.log('   Name:', name);
    console.log('   🔢 OTP CODE:', otp);
    console.log('   ⏰ Valid for: 10 minutes');
    console.log('📧 =================================\n');
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'DevPost AI'}" <${process.env.EMAIL_FROM || 'noreply@devpostai.com'}>`,
      to: email,
      subject: 'Verify Your Email - DevPost AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
            .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 Welcome to DevPost AI!</h1>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>Thanks for signing up! We're excited to have you on board.</p>
              <p>To verify your email address, please enter this verification code:</p>
              <div class="otp-box">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Verification Code</p>
                <div class="otp-code">${otp}</div>
                <p style="margin: 0; color: #666; font-size: 12px;">Valid for 10 minutes</p>
              </div>
              <p><strong>⏰ This code will expire in 10 minutes.</strong></p>
              <p>If you didn't create an account with DevPost AI, please ignore this email.</p>
              <p>Best regards,<br>The DevPost AI Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} DevPost AI. All rights reserved.</p>
              <p>For security reasons, never share this code with anyone.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${name},
        
        Thanks for signing up for DevPost AI!
        
        Your verification code is: ${otp}
        
        This code will expire in 10 minutes.
        
        If you didn't create an account, please ignore this email.
        
        Best regards,
        The DevPost AI Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('\n✅ =================================');
    console.log('✅ EMAIL SENT SUCCESSFULLY!');
    console.log('✅ =================================');
    console.log('   Message ID:', info.messageId);
    
    // For development with Ethereal - Show preview link
    if (process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('\n🎉 VIEW EMAIL IN BROWSER:');
      console.log('   👉', previewUrl);
      console.log('\n   Copy and paste the URL above to see the email!');
    }
    console.log('✅ =================================\n');
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('\n❌ =================================');
    console.error('❌ EMAIL SENDING FAILED!');
    console.error('❌ =================================');
    console.error('   Error:', error.message);
    console.error('❌ =================================\n');
    throw new Error('Failed to send verification email');
  }
};

// Send password reset OTP email
export const sendPasswordResetEmail = async (email, name, otp) => {
  try {
    const transporter = await createTransporter();
    
    console.log('\n🔐 =================================');
    console.log('🔐 SENDING PASSWORD RESET OTP');
    console.log('🔐 =================================');
    console.log('   To:', email);
    console.log('   Name:', name);
    console.log('   🔢 OTP CODE:', otp);
    console.log('   ⏰ Valid for: 10 minutes');
    console.log('🔐 =================================\n');
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'DevPost AI'}" <${process.env.EMAIL_FROM || 'noreply@devpostai.com'}>`,
      to: email,
      subject: 'Reset Your Password - DevPost AI',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
            .otp-box { background: white; border: 2px dashed #667eea; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
            .otp-code { font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 8px; margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Reset Your Password</h1>
            </div>
            <div class="content">
              <p>Hi ${name},</p>
              <p>We received a request to reset your password for your DevPost AI account.</p>
              <p>Enter this verification code to reset your password:</p>
              <div class="otp-box">
                <p style="margin: 0; color: #666; font-size: 14px;">Your Reset Code</p>
                <div class="otp-code">${otp}</div>
                <p style="margin: 0; color: #666; font-size: 12px;">Valid for 10 minutes</p>
              </div>
              <p><strong>⏰ This code will expire in 10 minutes.</strong></p>
              <p>If you didn't request a password reset, please ignore this email and your password will remain unchanged.</p>
              <p>Best regards,<br>The DevPost AI Team</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} DevPost AI. All rights reserved.</p>
              <p>For security reasons, never share this code with anyone.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
        Hi ${name},
        
        We received a request to reset your password.
        
        Your password reset code is: ${otp}
        
        This code will expire in 10 minutes.
        
        If you didn't request this, please ignore this email.
        
        Best regards,
        The DevPost AI Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    
    console.log('\n✅ =================================');
    console.log('✅ PASSWORD RESET EMAIL SENT!');
    console.log('✅ =================================');
    console.log('   Message ID:', info.messageId);
    
    // For development with Ethereal - Show preview link
    if (process.env.NODE_ENV !== 'production') {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      console.log('\n🎉 VIEW EMAIL IN BROWSER:');
      console.log('   👉', previewUrl);
      console.log('\n   Copy and paste the URL above to see the email!');
    }
    console.log('✅ =================================\n');
    
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.log('\n❌ =================================');
    console.log('❌ FAILED TO SEND PASSWORD RESET EMAIL');
    console.log('❌ =================================');
    console.error('   Error:', error.message);
    console.log('❌ =================================\n');
    throw new Error('Failed to send password reset email');
  }
};
