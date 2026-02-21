import express from 'express';
import {
  initiateLinkedInAuth,
  handleLinkedInCallback,
  disconnectLinkedIn,
  toggleAutoPost
} from '../controllers/linkedinController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// OAuth routes
router.get('/auth', protect, initiateLinkedInAuth);
router.get('/callback', handleLinkedInCallback);

// Management routes (all protected)
router.post('/disconnect', protect, disconnectLinkedIn);
router.post('/toggle-auto-post', protect, toggleAutoPost);

export default router;
