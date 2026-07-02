import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

const ChatParticipant = sequelize.define('ChatParticipant', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  chat_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: Chat,
      key: 'id',
    }
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  joined_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  role: {
    type: DataTypes.ENUM('admin', 'member'),
    defaultValue: 'member',
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'chat_participants',
});

// Setup relationships
ChatParticipant.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
ChatParticipant.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default ChatParticipant;
