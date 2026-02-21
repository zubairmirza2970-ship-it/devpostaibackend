import User from '../models/User.js';
import { refreshLinkedInToken } from '../controllers/linkedinController.js';

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
        await user.reload();
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

    const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${user.linkedinAccessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0'
      },
      body: JSON.stringify(postData)
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('LinkedIn post error:', responseData);
      throw new Error(responseData.message || 'Failed to post to LinkedIn');
    }

    // Extract post ID and construct URL
    const postId = responseData.id;
    const postUrl = `https://www.linkedin.com/feed/update/${postId}`;

    return {
      success: true,
      postUrl,
      postId
    };

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
