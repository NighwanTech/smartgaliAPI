import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SocietyDocument from './society_document.model.js';
import User from '../user/user.model.js';

const SocietyDocumentAcknowledgement = sequelize.define('SocietyDocumentAcknowledgement', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  document_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: SocietyDocument,
      key: 'id',
    },
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: {
      model: User,
      key: 'userId',
    },
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '1.0',
  },
  acknowledged_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false,
  },
}, {
  timestamps: false,
  tableName: 'society_document_acknowledgements',
});

SocietyDocumentAcknowledgement.belongsTo(SocietyDocument, { foreignKey: 'document_id', as: 'document' });
SocietyDocumentAcknowledgement.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

export default SocietyDocumentAcknowledgement;
