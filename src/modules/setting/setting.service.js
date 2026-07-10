import Setting from './setting.model.js';

export const getSettingsByGroup = async (group) => {
  return await Setting.findAll({ where: { group } });
};

export const getPublicSettings = async () => {
  return await Setting.findAll({ where: { is_public: true } });
};

export const bulkUpdateSettings = async (group, settingsObj) => {
  const keys = Object.keys(settingsObj);
  
  // Use a transaction if needed, but for simplicity we'll just await Promise.all
  const promises = keys.map(async (key) => {
    const value = settingsObj[key];
    const [setting, created] = await Setting.findOrCreate({
      where: { key },
      defaults: {
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
        group,
        is_public: false // Default to false unless explicitly configured
      }
    });

    if (!created) {
      setting.value = typeof value === 'object' ? JSON.stringify(value) : String(value);
      await setting.save();
    }
  });

  await Promise.all(promises);
  return await getSettingsByGroup(group);
};
