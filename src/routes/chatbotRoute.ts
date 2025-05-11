import express from 'express';
import * as chatbotController from '../controllers/chatbotController';

const router = express.Router();

router.post('/', chatbotController.getChatbotResponse);

export default router;
