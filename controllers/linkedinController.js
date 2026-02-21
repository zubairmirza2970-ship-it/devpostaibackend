import User from '../models/User.js';

// @desc    Initiate LinkedIn OAuth
// @route   GET /api/linkedin/auth
// @access  Private
export const initiateLinkedInAuth = (req, res) => {
  const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
  const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5000/api/linkedin/callback';
  
  if (!LINKEDIN_CLIENT_ID) {
    return res.status(500).json({
      success: false,
      message: 'LinkedIn client ID not configured'
    });
  }
  
  const state = req.user._id.toString(); // Use user ID as state for verification
  
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
    `response_type=code` +
    `&client_id=${LINKEDIN_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(LINKEDIN_REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=openid profile email w_member_social`;

  res.json({
    success: true,
    authUrl
  });
};

// @desc    Handle LinkedIn OAuth callback
// @route   GET /api/linkedin/callback
// @access  Public
export const handleLinkedInCallback = async (req, res) => {
  try {
    const { code, state } = req.query;
    const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
    const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
    const LINKEDIN_REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || 'http://localhost:5000/api/linkedin/callback';
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

    if (!code) {
      return res.redirect(`${CLIENT_URL}/dashboard?error=no_code`);
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
        redirect_uri: LINKEDIN_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('LinkedIn token error:', tokenData);
      return res.redirect(`${CLIENT_URL}/dashboard?error=token_failed`);
    }

    // Get LinkedIn user profile
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      }
    });

    const profileData = await profileResponse.json();

    // Update user with LinkedIn tokens
    const user = await User.findById(state);
    
    if (!user) {
      return res.redirect(`${CLIENT_URL}/dashboard?error=user_not_found`);
    }

    user.linkedinAccessToken = tokenData.access_token;
    user.linkedinRefreshToken = tokenData.refresh_token || null;
    user.linkedinTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    user.linkedinUserId = profileData.sub;
    await user.save();

    // Redirect back to dashboard
    res.redirect(`${CLIENT_URL}/dashboard?linkedin=connected`);

  } catch (error) {
    console.error('LinkedIn callback error:', error);
    const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${CLIENT_URL}/dashboard?error=auth_failed`);
  }
};

// @desc    Disconnect LinkedIn
// @route   POST /api/linkedin/disconnect
// @access  Private
export const disconnectLinkedIn = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    user.linkedinAccessToken = null;
    user.linkedinRefreshToken = null;
    user.linkedinTokenExpiry = null;
    user.linkedinUserId = null;
    user.autoPostToLinkedIn = false;
    await user.save();

    res.json({
      success: true,
      message: 'LinkedIn disconnected successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error disconnecting LinkedIn',
      error: error.message
    });
  }
};

// @desc    Toggle auto-post to LinkedIn
// @route   POST /api/linkedin/toggle-auto-post
// @access  Private
export const toggleAutoPost = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    if (!user.linkedinAccessToken) {
      return res.status(400).json({
        success: false,
        message: 'Please connect your LinkedIn account first'
      });
    }

    user.autoPostToLinkedIn = !user.autoPostToLinkedIn;
    await user.save();

    res.json({
      success: true,
      autoPostToLinkedIn: user.autoPostToLinkedIn
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error toggling auto-post',
      error: error.message
    });
  }
};

// @desc    Refresh LinkedIn access token
// @route   POST /api/linkedin/refresh-token
// @desc    Refresh LinkedIn access token
// @route   POST /api/linkedin/refresh-token
// @access  Private (internal use)
export const refreshLinkedInToken = async (userId) => {
  try {
    const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
    const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
    
    const user = await User.findById(userId);
    
    if (!user.linkedinRefreshToken) {
      throw new Error('No refresh token available');
    }

    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.linkedinRefreshToken,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error('Failed to refresh token');
    }

    user.linkedinAccessToken = tokenData.access_token;
    user.linkedinTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    await user.save();

    return tokenData.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};
