import sequelize from '../src/config/db.js';

async function checkLocalUrls() {
  const [up] = await sequelize.query(
    "SELECT userProfileId, avatarUrl FROM user_profiles WHERE avatarUrl LIKE '%localhost%' OR avatarUrl LIKE '%127.0.0.1%' OR avatarUrl LIKE '%192.168.%'"
  );
  console.log('user_profiles:', up);

  const [comm] = await sequelize.query(
    "SELECT communityId, cover_image FROM communities WHERE cover_image LIKE '%localhost%' OR cover_image LIKE '%127.0.0.1%' OR cover_image LIKE '%192.168.%'"
  );
  console.log('communities:', comm);

  const [msgs] = await sequelize.query(
    "SELECT id, media_url FROM messages WHERE media_url LIKE '%localhost%' OR media_url LIKE '%127.0.0.1%' OR media_url LIKE '%192.168.%'"
  );
  console.log(`messages (${msgs.length}):`, msgs.slice(0, 5));
  process.exit(0);
}

checkLocalUrls().catch(err => {
  console.error(err);
  process.exit(1);
});
