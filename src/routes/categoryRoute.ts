import express from 'express';
import * as categoryController from '../controllers/categoryController';
import * as authController from '../controllers/authController';
import multer from 'multer';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/client', categoryController.getClientCategories);

router.use(authController.protect, authController.restrictTo('admin'));

router
  .route('/')
  .get(categoryController.getAllCategories)
  .post(upload.single('image'), categoryController.createCategory);

router
  .route('/:id')
  .patch(upload.single('image'), categoryController.updateCategory)
  .delete(categoryController.deleteCategory);

router.route('/slug/:slug').get(categoryController.getCategoryBySlug);
router.route('/slug/:slug/summary').get(categoryController.getCategorySummary);

export default router;
