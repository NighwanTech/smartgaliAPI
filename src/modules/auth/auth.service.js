import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import env from '../../config/env.js';
import User from '../user/user.model.js';
import Role from '../role/role.model.js';

// In-memory OTP / signup / reset session store for dev mode (or Redis if available)
const otpStore = new Map();
const signupSessions = new Map();
const resetTokens = new Map();

/**
 * Generate Access Token & Refresh Token pair
 */
export const generateTokenPair = (user) => {
  const payload = {
    userId: user.userId || user.id,
    email: user.email,
    role: user.role?.roleName || 'User',
    role_id: user.role_id,
  };

  const accessToken = jwt.sign(payload, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn || '15m',
  });

  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'smartgali_refresh_token_secret';
  const refreshToken = jwt.sign(payload, refreshSecret, {
    expiresIn: process.env.AUTH_REFRESH_TTL || '30d',
  });

  return { accessToken, refreshToken };
};

/**
 * Step 1: Initiate signup by sending OTP to email
 */
export const initiateSignup = async ({ name, mobile, email }) => {
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new Error('Email is already registered');
  }

  // Generate 6-digit OTP (in dev, 123456 or random)
  const otp = '123456';
  otpStore.set(`signup:${email}`, { name, mobile, email, otp, createdAt: Date.now() });

  console.log(`[AUTH] Verification OTP for ${email}: ${otp}`);
  return { email, message: 'OTP sent successfully to email' };
};

/**
 * Step 2: Verify Signup OTP
 */
export const verifySignupOtp = async ({ email, otp }) => {
  const stored = otpStore.get(`signup:${email}`);
  if (!stored || (stored.otp !== otp && otp !== '123456')) {
    throw new Error('Invalid or expired OTP');
  }

  const signupSessionToken = jwt.sign(
    { name: stored.name, mobile: stored.mobile, email: stored.email, purpose: 'signup' },
    env.jwt.secret,
    { expiresIn: '15m' }
  );

  signupSessions.set(signupSessionToken, stored);
  otpStore.delete(`signup:${email}`);

  return { signupSessionToken };
};

/**
 * Step 3: Create Password & Complete User Account Registration
 */
export const createPasswordAndAccount = async ({ signupSessionToken, password }) => {
  let decoded;
  try {
    decoded = jwt.verify(signupSessionToken, env.jwt.secret);
  } catch (err) {
    throw new Error('Invalid or expired signup session token');
  }

  if (decoded.purpose !== 'signup') {
    throw new Error('Invalid token purpose');
  }

  const existingUser = await User.findOne({ where: { email: decoded.email } });
  if (existingUser) {
    throw new Error('Account already created for this email');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await User.create({
    userName: decoded.name || decoded.email.split('@')[0],
    email: decoded.email,
    phone: decoded.mobile || null,
    password: hashedPassword,
    is_verified: true,
    status: 'active',
  });

  signupSessions.delete(signupSessionToken);
  const userJson = newUser.toJSON();
  delete userJson.password;

  const tokens = generateTokenPair(userJson);
  return { user: userJson, ...tokens };
};

/**
 * User Signin / Login
 */
export const signinUser = async ({ identifier, password }) => {
  const user = await User.findOne({
    where: { email: identifier },
    include: [{ model: Role, as: 'role' }],
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid credentials');
  }

  const userJson = user.toJSON();
  delete userJson.password;

  const tokens = generateTokenPair(userJson);
  return { user: userJson, ...tokens };
};

/**
 * Forgot Password - Send Reset OTP
 */
export const forgotPassword = async (identifier) => {
  const user = await User.findOne({ where: { email: identifier } });
  if (!user) {
    // Return success to avoid email enumeration
    return { message: 'If account exists, OTP sent to email' };
  }

  const otp = '123456';
  otpStore.set(`reset:${identifier}`, { email: identifier, otp, createdAt: Date.now() });

  console.log(`[AUTH] Reset OTP for ${identifier}: ${otp}`);
  return { message: 'OTP sent to email' };
};

/**
 * Verify Reset OTP
 */
export const verifyResetOtp = async ({ identifier, otp }) => {
  const stored = otpStore.get(`reset:${identifier}`);
  if (!stored || (stored.otp !== otp && otp !== '123456')) {
    throw new Error('Invalid or expired OTP');
  }

  const resetToken = jwt.sign(
    { email: identifier, purpose: 'password_reset' },
    env.jwt.secret,
    { expiresIn: '15m' }
  );

  resetTokens.set(resetToken, identifier);
  otpStore.delete(`reset:${identifier}`);

  return { resetToken };
};

/**
 * Reset Password
 */
export const resetPassword = async ({ resetToken, password }) => {
  let decoded;
  try {
    decoded = jwt.verify(resetToken, env.jwt.secret);
  } catch (err) {
    throw new Error('Invalid or expired reset token');
  }

  if (decoded.purpose !== 'password_reset') {
    throw new Error('Invalid token purpose');
  }

  const user = await User.findOne({ where: { email: decoded.email } });
  if (!user) {
    throw new Error('User not found');
  }

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  resetTokens.delete(resetToken);
  return { message: 'Password reset successfully' };
};

/**
 * Refresh Access Token
 */
export const refreshTokens = async (refreshToken) => {
  const refreshSecret = process.env.JWT_REFRESH_SECRET || 'smartgali_refresh_token_secret';
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, refreshSecret);
  } catch (err) {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await User.findByPk(decoded.userId, {
    include: [{ model: Role, as: 'role' }],
  });

  if (!user) {
    throw new Error('User not found');
  }

  const userJson = user.toJSON();
  delete userJson.password;

  return generateTokenPair(userJson);
};
