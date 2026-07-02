import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import Chat from '../chat/chat.model.js';

const Message = sequelize.define('Message', {
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
  sender_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: {
      model: User,
      key: 'userId',
    }
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  media_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  reply_to: {
    type: DataTypes.BIGINT,
    allowNull: true,
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...commonFields
}, {
  timestamps: false,
  tableName: 'messages',
});

// Setup relationships
Message.belongsTo(Chat, { foreignKey: 'chat_id', as: 'chat' });
Message.belongsTo(User, { foreignKey: 'sender_id', as: 'sender' });
Message.belongsTo(Message, { foreignKey: 'reply_to', as: 'repliedMessage' });
Message.hasMany(Message, { foreignKey: 'reply_to', as: 'replies' });

export default Message;
