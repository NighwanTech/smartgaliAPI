import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Community from '../community/community.model.js';
import Event from '../event/event.model.js';
import BusinessProfile from '../business_profile/business_profile.model.js';

const Chat = sequelize.define('Chat', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  chat_type: {
    type: DataTypes.ENUM('one_to_one', 'group', 'community', 'event', 'business'),
    defaultValue: 'one_to_one',
  },
  community_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Community,
      key: 'communityId',
    }
  },
  event_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Event,
      key: 'id',
    }
  },
  business_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: BusinessProfile,
      key: 'id',
    }
  },
  ...commonFields,
  created_by: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  }
}, {
  timestamps: false,
  tableName: 'chats',
});

// Setup relationships
Chat.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });
Chat.belongsTo(Community, { foreignKey: 'community_id', as: 'community' });
Chat.belongsTo(Event, { foreignKey: 'event_id', as: 'event' });
Chat.belongsTo(BusinessProfile, { foreignKey: 'business_id', as: 'business' });

export default Chat;
