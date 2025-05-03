import express from 'express';
import * as categoryController from '../controllers/categoryController';
import * as authController from '../controllers/authController';

const router = express.Router();

router.use(authController.protect, authController.restrictTo('admin'));

router
  .route('/')
  .get(categoryController.getAllCategories)
  .post(categoryController.createCategory);
router
  .route('/:id')
  .patch(categoryController.updateCategory)
  .delete(categoryController.deleteCategory);

router.route('/slug/:slug').get(categoryController.getCategoryBySlug);

export default router;
