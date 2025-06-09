import express from 'express';
import * as chatbotController from '../controllers/chatbotController';
import * as authController from '../controllers/authController';

const router = express.Router();

// Public chatbot endpoint
router.post('/', chatbotController.getChatbotResponse);

// Analytics endpoints (admin only)
router.use(authController.protect, authController.restrictTo('admin'));

router.get('/analytics', chatbotController.getChatbotAnalytics);
router.get('/benchmark', chatbotController.getBenchmarkReport);

// RAG management endpoints
router.post('/rag/initialize', chatbotController.initializeRAG);
router.get('/rag/search', chatbotController.searchProducts);
router.get('/rag/recommendations', chatbotController.getProductRecommendations);

export default router;
