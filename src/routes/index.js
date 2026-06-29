import express from 'express';
import exampleRoutes from '../modules/example/example.routes.js';
import roleRoutes from '../modules/role/role.routes.js';
import userRoutes from '../modules/user/user.routes.js';
import userProfileRoutes from '../modules/userProfile/userProfile.routes.js';
import communityCategoryRoutes from '../modules/communityCategory/communityCategory.routes.js';
import communityRoutes from '../modules/community/community.routes.js';
import communityMemberRoutes from '../modules/communityMember/communityMember.routes.js';

const router = express.Router();

// Mount example module routes
router.use('/example', exampleRoutes);
router.use('/role', roleRoutes);
router.use('/user', userRoutes);
router.use('/user-profile', userProfileRoutes);
router.use('/community-category', communityCategoryRoutes);
router.use('/community', communityRoutes);
router.use('/community-member', communityMemberRoutes);

// Health check route
router.get('/health', (req, res) => {
  res.status(200).json({ success: true, message: 'Server is healthy' });
});

export default router;
