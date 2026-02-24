import User from '../models/User.js';
import { refreshLinkedInToken } from '../controllers/linkedinController.js';
import axios from 'axios';

// @desc    Post content to LinkedIn
// @param   userId - User ID
// @param   content - Post content/text
// @returns LinkedIn post URL or error
export const postToLinkedIn = async (userId, content) => {
  try {
    const user = await User.findById(userId);

    if (!user.linkedinAccessToken) {
      throw new Error('LinkedIn not connected');
    }

    // Check if token is expired
    if (user.linkedinTokenExpiry && new Date() >= user.linkedinTokenExpiry) {
      console.log('Token expired, refreshing...');
      try {
        await refreshLinkedInToken(userId);
        // Reload user with fresh token
        const updatedUser = await User.findById(userId);
        user.linkedinAccessToken = updatedUser.linkedinAccessToken;
        user.linkedinTokenExpiry = updatedUser.linkedinTokenExpiry;
      } catch (error) {
        throw new Error('LinkedIn token expired. Please reconnect your account.');
      }
    }

    // Create LinkedIn post using UGC API
    const postData = {
      author: `urn:li:person:${user.linkedinUserId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content
          },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
      }
    };

    // Add timeout for slow networks
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', postData, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        timeout: 30000,
        signal: controller.signal
      });

      clearTimeout(timeout);

      // Extract post ID and construct URL
      const postId = response.data.id;
      const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

      return {
        success: true,
        postUrl,
        postId
      };
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError' || fetchError.code === 'ECONNABORTED') {
        throw new Error('LinkedIn API timeout (30s exceeded). Your network connection may be slow.');
      }
      
      if (fetchError.code === 'ETIMEDOUT') {
        throw new Error('Network timeout connecting to LinkedIn. Please check your internet and try again.');
      }
      
      if (fetchError.response) {
        // LinkedIn API error
        console.error('LinkedIn post error:', fetchError.response.data);
        throw new Error(fetchError.response.data.message || 'Failed to post to LinkedIn');
      }
      
      throw fetchError;
    }

  } catch (error) {
    console.error('Error posting to LinkedIn:', error);
    throw error;
  }
};

// @desc    Check if user's LinkedIn token is valid
export const isLinkedInTokenValid = async (userId) => {
  try {
    const user = await User.findById(userId);
    
    if (!user.linkedinAccessToken) {
      return false;
    }

    if (user.linkedinTokenExpiry && new Date() >= user.linkedinTokenExpiry) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

// @desc    Fetch LinkedIn posts for the user
// @param   userId - User ID
// @param   count - Number of posts to fetch (default: 10, max: 50)
// @returns Array of LinkedIn posts
export const fetchLinkedInPosts = async (userId, count = 10) => {
  try {
    const user = await User.findById(userId);

    if (!user.linkedinAccessToken) {
      throw new Error('LinkedIn not connected');
    }

    if (!user.linkedinUserId) {
      throw new Error('LinkedIn user ID not found. Please reconnect your LinkedIn account.');
    }

    // Check if token is expired and refresh if needed
    if (user.linkedinTokenExpiry && new Date() >= user.linkedinTokenExpiry) {
      console.log('Token expired, refreshing...');
      try {
        await refreshLinkedInToken(userId);
        // Reload user with fresh token
        const updatedUser = await User.findById(userId);
        user.linkedinAccessToken = updatedUser.linkedinAccessToken;
        user.linkedinTokenExpiry = updatedUser.linkedinTokenExpiry;
      } catch (error) {
        throw new Error('LinkedIn token expired. Please reconnect your account.');
      }
    }

    // Validate count
    const postCount = Math.min(Math.max(count, 1), 50);

    // Debug logs
    console.log('📥 Fetching LinkedIn posts...');
    console.log('   User ID:', user.linkedinUserId);
    console.log('   Token present:', !!user.linkedinAccessToken);
    console.log('   Token expiry:', user.linkedinTokenExpiry);

    // Create AbortController for timeout (30 seconds for slow networks)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let responseData;
    try {
      // Fetch posts using LinkedIn UGC Posts API
      const apiUrl = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${user.linkedinUserId})&count=${postCount}&sortBy=LAST_MODIFIED`;
      console.log('   API URL:', apiUrl);

      const response = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${user.linkedinAccessToken}`,
          'X-Restli-Protocol-Version': '2.0.0'
        },
        timeout: 30000,
        signal: controller.signal
      });

      clearTimeout(timeout);

      console.log('   Response status:', response.status);
      responseData = response.data;

      console.log('✅ Successfully fetched', responseData.elements?.length || 0, 'posts');
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError' || fetchError.code === 'ECONNABORTED') {
        throw new Error('LinkedIn API timeout (30s exceeded). Your network connection may be slow. Please try again.');
      }
      
      // Better error messages for network issues
      if (fetchError.code === 'ETIMEDOUT') {
        throw new Error('Network timeout connecting to LinkedIn. Please check your internet connection and try again.');
      }
      
      if (fetchError.code === 'ECONNREFUSED') {
        throw new Error('Connection refused by LinkedIn API. Please try again later.');
      }
      
      if (fetchError.response) {
        console.error('LinkedIn fetch posts error:', fetchError.response.data);
        throw new Error(fetchError.response.data.message || `Failed to fetch LinkedIn posts (Status: ${fetchError.response.status})`);
      }
      
      throw fetchError;
    }

    // Parse and format the posts
    const posts = responseData.elements?.map(post => {
      const text = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || '';
      const createdAt = post.created?.time ? new Date(post.created.time) : null;
      const lastModified = post.lastModified?.time ? new Date(post.lastModified.time) : null;
      
      return {
        id: post.id,
        text: text,
        createdAt: createdAt,
        lastModified: lastModified,
        lifecycleState: post.lifecycleState,
        visibility: post.visibility?.['com.linkedin.ugc.MemberNetworkVisibility'],
        url: `https://www.linkedin.com/feed/update/${post.id}`
      };
    }) || [];

    return {
      success: true,
      count: posts.length,
      posts: posts
    };

  } catch (error) {
    console.error('Error fetching LinkedIn posts:', error);
    throw error;
  }
};
