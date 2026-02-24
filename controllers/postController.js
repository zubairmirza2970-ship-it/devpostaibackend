import Post from '../models/Post.js';
import User from '../models/User.js';
import { postToLinkedIn } from '../services/linkedinService.js';

// @desc    Generate LinkedIn post using AI
// @route   POST /api/posts/generate
// @access  Private
export const generatePost = async (req, res) => {
  try {
    const { topic, tone, length } = req.body;
    const userId = req.user._id;

    // Validation
    if (!topic || !tone || !length) {
      return res.status(400).json({
        success: false,
        message: 'Please provide topic, tone, and length'
      });
    }

    // Check user's post limit
    const user = await User.findById(userId);
    
    if (!user.canGeneratePost()) {
      return res.status(403).json({
        success: false,
        message: 'Monthly post limit reached. Upgrade to Pro for unlimited posts!',
        limit: true
      });
    }

    // Get webhook URL from environment (read dynamically)
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
    
    if (!N8N_WEBHOOK_URL) {
      throw new Error('N8N_WEBHOOK_URL not configured');
    }

    // Call n8n webhook (prompts are configured in n8n)
    // Format the input to match n8n's chatInput field
    const chatInput = `${topic} (Tone: ${tone}, Length: ${length})`;
    
    console.log('🔄 Calling n8n webhook:', N8N_WEBHOOK_URL);
    console.log('📤 Payload:', { chatInput });
    
    // Create AbortController for timeout (60 seconds for AI processing)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    
    try {
      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chatInput
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      console.log('📥 n8n Response Status:', n8nResponse.status);

      if (!n8nResponse.ok) {
        const errorText = await n8nResponse.text();
        console.error('❌ n8n webhook error:', errorText);
        throw new Error(`n8n webhook failed: ${n8nResponse.statusText}`);
      }

      const n8nData = await n8nResponse.json();
      console.log('✅ n8n Response Data:', n8nData);
      
      const generatedContent = n8nData.content || n8nData.message || n8nData.text || String(n8nData);

      if (!generatedContent || generatedContent === '[object Object]') {
        throw new Error('Invalid response from n8n webhook');
      }

      if (!generatedContent || generatedContent === '[object Object]') {
        throw new Error('Invalid response from n8n webhook');
      }

      // Save post to database
      const post = await Post.create({
        userId,
        topic,
        tone,
        length,
        content: generatedContent
      });

      // Update user's post count
      user.postsGenerated += 1;
      user.monthlyPostsCount += 1;
      await user.save();

      // Auto-post to LinkedIn if enabled
      let linkedinPostUrl = null;
      if (user.autoPostToLinkedIn && user.linkedinAccessToken) {
        try {
          console.log('📤 Auto-posting to LinkedIn...');
          const linkedinResult = await postToLinkedIn(userId, generatedContent);
          linkedinPostUrl = linkedinResult.postUrl;
          console.log('✅ Posted to LinkedIn:', linkedinPostUrl);
        } catch (error) {
          console.error('❌ LinkedIn auto-post failed:', error.message);
          // Don't fail the whole request if LinkedIn posting fails
        }
      }

      res.status(201).json({
        success: true,
        data: post,
        linkedinPostUrl,
        remaining: ({ free: 5, starter: 20, pro: 50 }[user.plan] || 5) - user.monthlyPostsCount
      });
      
    } catch (fetchError) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout - AI is taking too long to respond. Please try again.');
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Error generating post:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error generating post'
    });
  }
};

// @desc    Get all posts for current user
// @route   GET /api/posts
// @access  Private
export const getPosts = async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      count: posts.length,
      data: posts
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching posts',
      error: error.message
    });
  }
};

// @desc    Get single post
// @route   GET /api/posts/:id
// @access  Private
export const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post belongs to user
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this post'
      });
    }

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching post',
      error: error.message
    });
  }
};

// @desc    Update post
// @route   PUT /api/posts/:id
// @access  Private
export const updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post belongs to user
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post'
      });
    }

    // Update content
    post.content = req.body.content || post.content;
    await post.save();

    res.json({
      success: true,
      data: post
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating post',
      error: error.message
    });
  }
};

// @desc    Delete post
// @route   DELETE /api/posts/:id
// @access  Private
export const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post belongs to user
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }

    await post.deleteOne();

    res.json({
      success: true,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting post',
      error: error.message
    });
  }
};

// @desc    Get user stats
// @route   GET /api/posts/stats
// @access  Private
export const getStats = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const totalPosts = await Post.countDocuments({ userId: req.user._id });

    res.json({
      success: true,
      data: {
        plan: user.plan,
        totalPosts,
        monthlyPostsUsed: user.monthlyPostsCount,
        monthlyPostsLimit: { free: 5, starter: 20, pro: 50 }[user.plan] || 5,
        remaining: ({ free: 5, starter: 20, pro: 50 }[user.plan] || 5) - user.monthlyPostsCount,
        linkedinConnected: !!user.linkedinAccessToken,
        autoPostToLinkedIn: user.autoPostToLinkedIn
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching stats',
      error: error.message
    });
  }
};

// @desc    Manually post to LinkedIn
// @route   POST /api/posts/:id/post-to-linkedin
// @access  Private
export const manualPostToLinkedIn = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found'
      });
    }

    // Check if post belongs to user
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to post this'
      });
    }

    const user = await User.findById(req.user._id);

    if (!user.linkedinAccessToken) {
      return res.status(400).json({
        success: false,
        message: 'Please connect your LinkedIn account first'
      });
    }

    // Post to LinkedIn
    const result = await postToLinkedIn(req.user._id, post.content);

    res.json({
      success: true,
      linkedinPostUrl: result.postUrl,
      message: 'Successfully posted to LinkedIn!'
    });

  } catch (error) {
    console.error('Error posting to LinkedIn:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error posting to LinkedIn'
    });
  }
};
