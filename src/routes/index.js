import express from 'express';
import exampleRoutes from '../modules/example/example.routes.js';
import roleRoutes from '../modules/role/role.routes.js';
import userRoutes from '../modules/user/user.routes.js';
import userProfileRoutes from '../modules/userProfile/userProfile.routes.js';
import communityCategoryRoutes from '../modules/communityCategory/communityCategory.routes.js';
import communityRoutes from '../modules/community/community.routes.js';
import communityMemberRoutes from '../modules/communityMember/communityMember.routes.js';
import businessCategoryRoutes from '../modules/business_category/business_category.routes.js';
import businessProfileRoutes from '../modules/business_profile/business_profile.routes.js';
import businessImageRoutes from '../modules/business_image/business_image.routes.js';
import businessOfferRoutes from '../modules/business_offer/business_offer.routes.js';
import businessReviewRoutes from '../modules/business_review/business_review.routes.js';
import serviceCategoryRoutes from '../modules/service_category/service_category.routes.js';

const router = express.Router();

// Mount example module routes
router.use('/example', exampleRoutes);
router.use('/role', roleRoutes);
router.use('/user', userRoutes);
router.use('/user-profile', userProfileRoutes);
router.use('/community-category', communityCategoryRoutes);
router.use('/community', communityRoutes);
router.use('/community-member', communityMemberRoutes);
router.use('/business-category', businessCategoryRoutes);
router.use('/business-profile', businessProfileRoutes);
router.use('/business-image', businessImageRoutes);
router.use('/business-offer', businessOfferRoutes);
router.use('/business-review', businessReviewRoutes);
router.use('/service-category', serviceCategoryRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

export default router;
