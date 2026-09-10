import { successResponse, errorResponse } from '../../utils/response.js';
import * as authService from './auth.service.js';
import User from '../user/user.model.js';
import Role from '../role/role.model.js';
import UserProfile from '../userProfile/userProfile.model.js';

export const signup = async (req, res, next) => {
  try {
    const { name, mobile, email } = req.body;
    if (!email) {
      return errorResponse(res, 400, 'Email is required');
    }
    const result = await authService.initiateSignup({ name, mobile, email });
    return successResponse(res, 200, 'Signup initiated', result);
  } catch (error) {
    if (error.message.includes('already registered')) {
      return errorResponse(res, 400, error.message);
    }
    next(error);
  }
};

export const verifyEmailOtp = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return errorResponse(res, 400, 'Email and OTP are required');
    }
    const result = await authService.verifySignupOtp({ email, otp });
    return successResponse(res, 200, 'OTP verified successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const createPassword = async (req, res, next) => {
  try {
    const { signupSessionToken, password } = req.body;
    if (!signupSessionToken || !password) {
      return errorResponse(res, 400, 'Session token and password are required');
    }
    const result = await authService.createPasswordAndAccount({ signupSessionToken, password });
    return successResponse(res, 201, 'Account created successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const signin = async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return errorResponse(res, 400, 'Identifier and password are required');
    }
    const result = await authService.signinUser({ identifier, password });
    return successResponse(res, 200, 'Signed in successfully', result);
  } catch (error) {
    return errorResponse(res, 401, error.message);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return errorResponse(res, 400, 'Identifier is required');
    }
    const result = await authService.forgotPassword(identifier);
    return successResponse(res, 200, 'Password reset process initiated', result);
  } catch (error) {
    next(error);
  }
};

export const verifyResetOtp = async (req, res, next) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) {
      return errorResponse(res, 400, 'Identifier and OTP are required');
    }
    const result = await authService.verifyResetOtp({ identifier, otp });
    return successResponse(res, 200, 'Reset OTP verified successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;
    if (!resetToken || !password) {
      return errorResponse(res, 400, 'Reset token and password are required');
    }
    const result = await authService.resetPassword({ resetToken, password });
    return successResponse(res, 200, 'Password reset successfully', result);
  } catch (error) {
    return errorResponse(res, 400, error.message);
  }
};

export const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return errorResponse(res, 400, 'Refresh token is required');
    }
    const tokens = await authService.refreshTokens(token);
    return successResponse(res, 200, 'Token refreshed successfully', tokens);
  } catch (error) {
    return errorResponse(res, 401, error.message);
  }
};

export const logout = async (req, res, next) => {
  try {
    return successResponse(res, 200, 'Logged out successfully', null);
  } catch (error) {
    next(error);
  }
};

export const getProfile = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return errorResponse(res, 401, 'Unauthorized');
    }

    // Load user with Role + UserProfile (avatarUrl, bio, locationName, isProfileComplete)
    // WARN-007 fix: serialize response to match Flutter UserProfileModel.fromJson contract.
    const user = await User.findByPk(userId, {
      include: [
        { model: Role, as: 'role' },
        {
          model: UserProfile,
          as: 'profile',
          attributes: ['avatarUrl', 'fullName', 'bio', 'locationName', 'isProfileComplete'],
        },
      ],
    });

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const profile = user.profile; // may be null if user has no profile row yet

    // Flutter UserProfileModel.fromJson expects these exact keys:
    //   id, fullName, email, phone, role (string), isActive (bool),
    //   isVerified (bool), hasPassword (bool), avatarUrl, bio,
    //   locationName, latitude, longitude, isProfileComplete (bool)
    const responsePayload = {
      id:                user.userId,
      fullName:          profile?.fullName || user.userName,
      email:             user.email,
      phone:             user.phone ?? null,
      role:              user.role?.roleName ?? 'resident',
      isActive:          user.is_active === true || user.is_active === 1,
      isVerified:        user.is_verified === true || user.is_verified === 1,
      hasPassword:       !!user.password,
      avatarUrl:         profile?.avatarUrl ?? null,
      bio:               profile?.bio ?? null,
      locationName:      profile?.locationName ?? null,
      latitude:          user.latitude != null ? parseFloat(user.latitude) : null,
      longitude:         user.longitude != null ? parseFloat(user.longitude) : null,
      isProfileComplete: profile?.isProfileComplete === true || profile?.isProfileComplete === 1,
    };
    // password is never included — it is not part of responsePayload

    return successResponse(res, 200, 'Profile fetched successfully', responsePayload);
  } catch (error) {
    next(error);
  }
};
