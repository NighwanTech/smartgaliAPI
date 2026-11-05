import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';
import SocietyProfile from '../society_profile/society_profile.model.js';
import { State, District, City, Locality, Pincode } from '../location_master/location_master.models.js';

/**
 * UserAddress — Enterprise saved delivery/home/office/society addresses.
 * A user can have many addresses; exactly one active address can be flagged as default.
 */
const UserAddress = sequelize.define('UserAddress', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.BIGINT,
    allowNull: false,
    references: { model: User, key: 'userId' },
  },
  address_type: {
    type: DataTypes.ENUM('HOME', 'OFFICE', 'OTHER'),
    allowNull: false,
    defaultValue: 'HOME',
  },
  flat_unit: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  building_name: {
    type: DataTypes.STRING(200),
    allowNull: true,
  },
  street_address: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  locality: {
    type: DataTypes.STRING(150),
    allowNull: true,
  },
  // Backward compatibility alias & UI label
  label: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'Home',
  },
  house_no: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  street: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  landmark: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  city: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  district: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  pincode: {
    type: DataTypes.STRING(20),
    allowNull: true,
  },
  society_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: SocietyProfile, key: 'id' },
  },
  state_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: State, key: 'id' },
  },
  district_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: District, key: 'id' },
  },
  city_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: City, key: 'id' },
  },
  locality_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: Locality, key: 'id' },
  },
  pincode_id: {
    type: DataTypes.BIGINT,
    allowNull: true,
    references: { model: Pincode, key: 'id' },
  },
  // Pre-composed, display-ready address string
  full_address: {
    type: DataTypes.TEXT,
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
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ...commonFields,
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  timestamps: false,
  tableName: 'user_addresses',
});

UserAddress.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(UserAddress, { foreignKey: 'user_id', as: 'addresses' });

UserAddress.belongsTo(SocietyProfile, { foreignKey: 'society_id', as: 'society' });
SocietyProfile.hasMany(UserAddress, { foreignKey: 'society_id', as: 'addresses' });

UserAddress.belongsTo(State, { foreignKey: 'state_id', as: 'stateMaster' });
UserAddress.belongsTo(District, { foreignKey: 'district_id', as: 'districtMaster' });
UserAddress.belongsTo(City, { foreignKey: 'city_id', as: 'cityMaster' });
UserAddress.belongsTo(Locality, { foreignKey: 'locality_id', as: 'localityMaster' });
UserAddress.belongsTo(Pincode, { foreignKey: 'pincode_id', as: 'pincodeMaster' });

export default UserAddress;
