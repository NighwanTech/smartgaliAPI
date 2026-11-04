import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { commonFields } from '../../utils/commonFields.js';
import User from '../user/user.model.js';

// 1. Country Master
export const Country = sequelize.define('Country', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  iso_code: { type: DataTypes.STRING(10), allowNull: false, unique: true },
  phone_code: { type: DataTypes.STRING(10), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'countries', timestamps: false });

// 2. State Master
export const State = sequelize.define('State', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  country_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: Country, key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(20), allowNull: true },
  lgd_state_code: { type: DataTypes.STRING(50), allowNull: true },
  state_name_local: { type: DataTypes.STRING(150), allowNull: true },
  state_census2011_code: { type: DataTypes.STRING(50), allowNull: true },
  state_or_ut: { type: DataTypes.STRING(50), allowNull: true },
  source_system: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'MANUAL' },
  source_last_updated: { type: DataTypes.DATE, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, {
  tableName: 'states',
  timestamps: false,
  indexes: [
    { name: 'uniq_states_lgd_code', fields: ['lgd_state_code'], unique: true },
  ],
});

// 2.5 District Master (Phase 1 Foundation)
export const District = sequelize.define('District', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  state_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: State, key: 'id' } },
  district_name_english: { type: DataTypes.STRING(150), allowNull: false },
  district_name_local: { type: DataTypes.STRING(150), allowNull: true },
  normalized_name: { type: DataTypes.STRING(150), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: true },
  lgd_district_code: { type: DataTypes.STRING(50), allowNull: true },
  district_census2011_code: { type: DataTypes.STRING(50), allowNull: true },
  source_system: { type: DataTypes.STRING(50), allowNull: true, defaultValue: 'MANUAL' },
  source_last_updated: { type: DataTypes.DATE, allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  name: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.getDataValue('district_name_english');
    },
    set(val) {
      this.setDataValue('district_name_english', val);
    },
  },
  ...commonFields,
}, {
  tableName: 'districts',
  timestamps: false,
  indexes: [
    { name: 'idx_districts_state_id', fields: ['state_id'] },
    { name: 'uniq_districts_lgd_code', fields: ['lgd_district_code'], unique: true },
    { name: 'idx_districts_state_normalized', fields: ['state_id', 'normalized_name'] },
    { name: 'idx_districts_status', fields: ['is_active', 'is_deleted'] },
  ],
});

// 3. City Master
export const City = sequelize.define('City', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  state_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: State, key: 'id' } },
  district_id: { type: DataTypes.BIGINT, allowNull: true, references: { model: District, key: 'id' } },
  name: { type: DataTypes.STRING(100), allowNull: false },
  normalized_name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(20), allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true },
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'cities', timestamps: false });

// 4. Locality Master
export const Locality = sequelize.define('Locality', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  city_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: City, key: 'id' } },
  name: { type: DataTypes.STRING(150), allowNull: false },
  normalized_name: { type: DataTypes.STRING(150), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: true },
  latitude: { type: DataTypes.DECIMAL(10, 8), allowNull: true }, // reference centroid for map display / discovery
  longitude: { type: DataTypes.DECIMAL(11, 8), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'localities', timestamps: false });

// 5. Pincode Master
export const Pincode = sequelize.define('Pincode', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  city_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: City, key: 'id' } },
  locality_id: { type: DataTypes.BIGINT, allowNull: true, references: { model: Locality, key: 'id' } },
  pincode: { type: DataTypes.STRING(10), allowNull: false },
  area_name: { type: DataTypes.STRING(150), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  display_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  ...commonFields,
}, { tableName: 'pincodes', timestamps: false });

// 6. Location Import Batch (Phase 2 Bulk Import Engine)
export const LocationImportBatch = sequelize.define('LocationImportBatch', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  batch_id: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  dataset_type: { type: DataTypes.ENUM('STATE', 'DISTRICT'), allowNull: false },
  file_name: { type: DataTypes.STRING(255), allowNull: false },
  file_size_bytes: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  file_hash: { type: DataTypes.STRING(100), allowNull: true },
  status: {
    type: DataTypes.ENUM('STAGED', 'VALIDATED', 'CONFIRMED', 'IMPORTING', 'COMPLETED', 'FAILED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'STAGED',
  },
  total_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  valid_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  invalid_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  new_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  existing_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  updated_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  skipped_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  failed_rows: { type: DataTypes.INTEGER, defaultValue: 0 },
  uploaded_by: { type: DataTypes.BIGINT, allowNull: false, references: { model: 'users', key: 'userId' } },
  confirmed_by: { type: DataTypes.BIGINT, allowNull: true, references: { model: 'users', key: 'userId' } },
  started_at: { type: DataTypes.DATE, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  error_summary: { type: DataTypes.JSON, allowNull: true },
  error_report: { type: DataTypes.JSON, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'location_import_batches',
  timestamps: false,
  indexes: [
    { name: 'uniq_lib_batch_id', fields: ['batch_id'], unique: true },
    { name: 'idx_lib_dataset_status', fields: ['dataset_type', 'status'] },
    { name: 'idx_lib_uploaded_by', fields: ['uploaded_by'] },
  ],
});

// 7. Location Staged Record (Phase 2 Bulk Import Engine)
export const LocationStagedRecord = sequelize.define('LocationStagedRecord', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  batch_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    references: { model: 'location_import_batches', key: 'batch_id' },
  },
  dataset_type: { type: DataTypes.ENUM('STATE', 'DISTRICT'), allowNull: false },
  row_number: { type: DataTypes.INTEGER, allowNull: false },
  raw_data: {
    type: DataTypes.JSON,
    allowNull: false,
    get() {
      const val = this.getDataValue('raw_data');
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
  },
  parsed_data: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const val = this.getDataValue('parsed_data');
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
  },
  action: {
    type: DataTypes.ENUM('INSERT', 'UPDATE', 'SKIP', 'ERROR'),
    allowNull: false,
    defaultValue: 'INSERT',
  },
  validation_status: {
    type: DataTypes.ENUM('VALID', 'INVALID'),
    allowNull: false,
    defaultValue: 'VALID',
  },
  validation_errors: {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const val = this.getDataValue('validation_errors');
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch { return val; }
      }
      return val;
    },
  },
  import_status: {
    type: DataTypes.ENUM('PENDING', 'IMPORTED', 'SKIPPED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  error_message: { type: DataTypes.TEXT, allowNull: true },
  matched_entity_id: { type: DataTypes.BIGINT, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'location_staged_records',
  timestamps: false,
  indexes: [
    { name: 'idx_lsr_batch_row', fields: ['batch_id', 'row_number'] },
    { name: 'idx_lsr_batch_val', fields: ['batch_id', 'validation_status'] },
    { name: 'idx_lsr_batch_imp', fields: ['batch_id', 'import_status'] },
  ],
});

// Relationships
Country.hasMany(State, { foreignKey: 'country_id', as: 'states' });
State.belongsTo(Country, { foreignKey: 'country_id', as: 'country' });

// State <-> District
State.hasMany(District, { foreignKey: 'state_id', as: 'districts' });
District.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

// District <-> City
District.hasMany(City, { foreignKey: 'district_id', as: 'cities' });
City.belongsTo(District, { foreignKey: 'district_id', as: 'district' });

// State <-> City (Preserved for 100% backward compatibility)
State.hasMany(City, { foreignKey: 'state_id', as: 'cities' });
City.belongsTo(State, { foreignKey: 'state_id', as: 'state' });

// City <-> Locality
City.hasMany(Locality, { foreignKey: 'city_id', as: 'localities' });
Locality.belongsTo(City, { foreignKey: 'city_id', as: 'city' });

// City & Locality <-> Pincode
City.hasMany(Pincode, { foreignKey: 'city_id', as: 'pincodes' });
Pincode.belongsTo(City, { foreignKey: 'city_id', as: 'city' });
Pincode.belongsTo(Locality, { foreignKey: 'locality_id', as: 'locality' });

// Import Batch Relationships
LocationImportBatch.hasMany(LocationStagedRecord, { foreignKey: 'batch_id', sourceKey: 'batch_id', as: 'staged_records' });
LocationStagedRecord.belongsTo(LocationImportBatch, { foreignKey: 'batch_id', targetKey: 'batch_id', as: 'batch' });
LocationImportBatch.belongsTo(User, { foreignKey: 'uploaded_by', as: 'uploader' });
LocationImportBatch.belongsTo(User, { foreignKey: 'confirmed_by', as: 'confirmer' });

export default {
  Country,
  State,
  District,
  City,
  Locality,
  Pincode,
  LocationImportBatch,
  LocationStagedRecord,
};
