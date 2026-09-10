import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';

// DEF-006: Destructure commonFields, omitting all attributes that do NOT exist
// in the live MySQL `posts` table (verified via describeTable on srv1100.hstgr.io).
//
// Confirmed PRESENT in live posts:   is_active, is_deleted, created_at  ✅
// Confirmed MISSING from live posts: created_by, updated_by, remark,
//                                    updatedAt, deletedRemarks           ❌
//
// commonFields is NOT modified globally — this exclusion is local to post.model.js.
const {
  created_by: _cb,
  updated_by: _ub,
  remark: _rm,
  updatedAt: _ua,
  deletedRemarks: _dr,
  ...postCommonFields
} = commonFields;

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Community,
      key: 'communityId',
    }
  },
  type: {
    type: DataTypes.ENUM('text', 'image', 'video', 'poll', 'event'),
    defaultValue: 'text',
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  location: {
    type: DataTypes.TEXT,
    field: 'location_name',
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  visibility: {
    type: DataTypes.ENUM('public', 'private', 'friends', 'community'),
    defaultValue: 'public',
  },
  // Only commonFields that physically exist in the live posts table:
  // is_active, is_deleted, created_at
  ...postCommonFields,
}, {
  timestamps: false,
  tableName: 'posts',
});

// Setup relationships
Post.belongsTo(User, { foreignKey: 'user_id', as: 'author' });
Post.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });

export default Post;
