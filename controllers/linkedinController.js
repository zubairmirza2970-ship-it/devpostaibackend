import User from '../models/User.js';
import { fetchLinkedInPosts } from '../services/linkedinService.js';
import axios from 'axios';

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
    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', 
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET,
        redirect_uri: LINKEDIN_REDIRECT_URI
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    const tokenData = tokenResponse.data;

    // Get LinkedIn user profile
    const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`
      },
      timeout: 30000
    });

    const profileData = profileResponse.data;

    // Update user with LinkedIn tokens
    const user = await User.findById(state);
    
    if (!user) {
      return res.redirect(`${CLIENT_URL}/dashboard?error=user_not_found`);
    }

    // SECURITY: Prevent LinkedIn account reuse across multiple DevPost accounts
    // One LinkedIn account can only be connected to ONE DevPost account
    const existingLinkedInUser = await User.findOne({
      linkedinUserId: profileData.sub,
      _id: { $ne: user._id } // Exclude current user
    });

    if (existingLinkedInUser) {
      console.log(`🚫 LinkedIn reuse blocked: User ${user._id} tried to connect LinkedIn already used by user ${existingLinkedInUser._id}`);
      return res.redirect(`${CLIENT_URL}/dashboard?error=linkedin_already_used`);
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

    const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: user.linkedinRefreshToken,
        client_id: LINKEDIN_CLIENT_ID,
        client_secret: LINKEDIN_CLIENT_SECRET
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );

    const tokenData = tokenResponse.data;

    user.linkedinAccessToken = tokenData.access_token;
    user.linkedinTokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    await user.save();

    return tokenData.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

// @desc    Get LinkedIn posts
// @route   GET /api/linkedin/posts
// @access  Private
export const getLinkedInPosts = async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 10;
    const result = await fetchLinkedInPosts(req.user._id, count);

    res.json({
      success: true,
      count: result.count,
      posts: result.posts
    });
  } catch (error) {
    console.error('Error fetching LinkedIn posts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching LinkedIn posts'
    });
  }
};

// @desc    Sync LinkedIn posts (fetch latest posts from LinkedIn)
// @route   POST /api/linkedin/sync-posts
// @access  Private
export const syncLinkedInPosts = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user.linkedinAccessToken) {
      return res.status(400).json({
        success: false,
        message: 'Please connect your LinkedIn account first'
      });
    }

    const count = parseInt(req.body.count) || 20;
    const result = await fetchLinkedInPosts(req.user._id, count);

    res.json({
      success: true,
      message: 'LinkedIn posts synced successfully',
      count: result.count,
      posts: result.posts,
      syncedAt: new Date()
    });
  } catch (error) {
    console.error('Error syncing LinkedIn posts:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error syncing LinkedIn posts'
    });
  }
};
