import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { readEnv } from '../app-config';
import { DEMO_PASS } from '../nest/common/demo';
// Static like in demo-reset.job.ts: the module top is inert, everything that
// touches the database happens inside the functions.
import { saveBaseline, hasBaseline } from './demo-reset';

function seedDemoData(db: Database.Database): { adminId: number; demoId: number } {
  const ADMIN_USER = readEnv().demo.adminUser;
  const ADMIN_EMAIL = readEnv().demo.adminEmailRaw || 'admin@trek.app';
  const ADMIN_PASS = readEnv().demo.adminPass;
  const DEMO_EMAIL = 'demo@trek.app';

  // Create admin user if not exists
  let admin = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL) as { id: number } | undefined;
  if (!admin) {
    if (!readEnv().demo.adminPassSet) {
      // The default is published in the docs and in this file, so an operator who
      // never set DEMO_ADMIN_PASS is handing out an admin account. Say so loudly;
      // changing the default would lock out every existing demo instance.
      console.warn(
        `[Demo] SECURITY: DEMO_ADMIN_PASS is not set. The admin account ${ADMIN_EMAIL} is being created ` +
          'with the public default password. Set DEMO_ADMIN_PASS before exposing this instance.',
      );
    }
    const hash = bcrypt.hashSync(ADMIN_PASS, 10);
    const r = db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(ADMIN_USER, ADMIN_EMAIL, hash, 'admin');
    admin = { id: Number(r.lastInsertRowid) };
    console.log('[Demo] Admin user created');
  } else {
    admin.id = Number(admin.id);
  }

  // Create demo user if not exists
  let demo = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL) as { id: number } | undefined;
  if (!demo) {
    const hash = bcrypt.hashSync(DEMO_PASS, 10);
    const r = db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run('demo', DEMO_EMAIL, hash, 'user');
    demo = { id: Number(r.lastInsertRowid) };
    console.log('[Demo] Demo user created');
  } else {
    demo.id = Number(demo.id);
  }

  // Disable registration in demo mode
  db.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('allow_registration', 'false')").run();

  // Check if admin already has example trips
  const adminTrips = db.prepare('SELECT COUNT(*) as count FROM trips WHERE user_id = ?').get(admin.id) as { count: number };
  if (adminTrips.count > 0) {
    console.log('[Demo] Example trips already exist, ensuring demo membership');
    ensureDemoMembership(db, admin.id, demo.id);
    return { adminId: admin.id, demoId: demo.id };
  }

  console.log('[Demo] Seeding example trips...');
  seedExampleTrips(db, admin.id, demo.id);

  // Auto-save baseline after first seed
  if (!hasBaseline()) {
    saveBaseline();
  }

  return { adminId: admin.id, demoId: demo.id };
}

function ensureDemoMembership(db: Database.Database, adminId: number, demoId: number): void {
  const trips = db.prepare('SELECT id FROM trips WHERE user_id = ?').all(adminId) as { id: number }[];
  const insertMember = db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)');
  for (const trip of trips) {
    insertMember.run(trip.id, demoId, adminId);
  }
}

function seedExampleTrips(db: Database.Database, adminId: number, demoId: number): void {
  const insertTrip = db.prepare('INSERT INTO trips (user_id, title, description, start_date, end_date, currency) VALUES (?, ?, ?, ?, ?, ?)');
  const insertDay = db.prepare('INSERT INTO days (trip_id, day_number, date) VALUES (?, ?, ?)');
  const insertPlace = db.prepare('INSERT INTO places (trip_id, name, lat, lng, address, category_id, place_time, duration_minutes, notes, image_url, google_place_id, website, phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertAssignment = db.prepare('INSERT INTO day_assignments (day_id, place_id, order_index) VALUES (?, ?, ?)');
  const insertPacking = db.prepare('INSERT INTO packing_items (trip_id, name, checked, category, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
  const insertBudget = db.prepare('INSERT INTO budget_items (trip_id, category, name, total_price, persons, note) VALUES (?, ?, ?, ?, ?, ?)');
  const insertReservation = db.prepare('INSERT INTO reservations (trip_id, day_id, title, reservation_time, confirmation_number, status, type, location) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const insertMember = db.prepare('INSERT OR IGNORE INTO trip_members (trip_id, user_id, invited_by) VALUES (?, ?, ?)');
  const insertNote = db.prepare('INSERT INTO day_notes (day_id, trip_id, text, time, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?)');

  // Category IDs: 1=Hotel, 2=Restaurant, 3=Attraction, 5=Transport, 7=Bar/Cafe, 8=Beach, 9=Nature, 6=Entertainment

  // --- Trip 1: Tokyo & Kyoto ---
  const trip1 = insertTrip.run(adminId, 'Tokyo & Kyoto', 'Two weeks in Japan — from the neon-lit streets of Tokyo to the serene temples of Kyoto.', '2026-04-15', '2026-04-21', 'JPY');
  const t1 = Number(trip1.lastInsertRowid);

  const t1days: number[] = [];
  for (let i = 0; i < 7; i++) {
    const d = insertDay.run(t1, i + 1, `2026-04-${15 + i}`);
    t1days.push(Number(d.lastInsertRowid));
  }

  const t1places: [number, string, number, number, string, number, string, number, string, string | null, string | null, string | null, string | null][] = [
    [t1, 'Hotel Shinjuku Granbell', 35.6938, 139.7035, '2-14-5 Kabukicho, Shinjuku City, Tokyo 160-0021, Japan', 1, '15:00', 60, 'Check-in from 3 PM. Steps from Shinjuku Station.', null, 'ChIJdaGEJBeMGGARYgt8sLBv6lM', 'https://www.grfranbellhotel.jp/shinjuku/', '+81 3-5155-2666'],
    [t1, 'Senso-ji Temple', 35.7148, 139.7967, '2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan', 3, '09:00', 90, 'Oldest temple in Tokyo. Fewer tourists in the early morning.', null, 'ChIJ8T1GpMGOGGARDYGSgpoOdfg', 'https://www.senso-ji.jp/', '+81 3-3842-0181'],
    [t1, 'Shibuya Crossing', 35.6595, 139.7004, '2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo 150-0043, Japan', 3, '18:00', 45, 'World\'s busiest pedestrian crossing. Most impressive at night.', null, 'ChIJLyzOhmyLGGARMKWbl5z6wGg', null, null],
    [t1, 'Tsukiji Outer Market', 35.6654, 139.7707, '4 Chome-16-2 Tsukiji, Chuo City, Tokyo 104-0045, Japan', 2, '08:00', 120, 'Fresh sushi for breakfast! Explore the street food stalls.', null, 'ChIJq2i1dZCLGGAR1TfoBRo25VU', 'https://www.tsukiji.or.jp/', null],
    [t1, 'Meiji Jingu Shrine', 35.6764, 139.6993, '1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557, Japan', 3, '10:00', 75, 'Peaceful oasis in the middle of the city. Walk through the forest to the shrine.', null, 'ChIJ5SuJSByMGGARMg9qOlTFgkc', 'https://www.meijijingu.or.jp/', '+81 3-3379-5511'],
    [t1, 'Akihabara Electric Town', 35.7023, 139.7745, 'Sotokanda, Chiyoda City, Tokyo, Japan', 3, '14:00', 180, 'Electric Town — anime, manga, electronics. Retro gaming shops!', null, 'ChIJGz1usEyMGGAR1mYByqOOJao', null, null],
    [t1, 'Shinkansen to Kyoto', 35.6812, 139.7671, '1 Chome Marunouchi, Chiyoda City, Tokyo 100-0005, Japan', 5, '08:30', 140, 'Nozomi Shinkansen, approx. 2h15. Window seat for Mt. Fuji views!', null, 'ChIJC3Cf2PuLGGAROO00ukl8JwA', null, null],
    [t1, 'Hotel Granvia Kyoto', 34.9856, 135.7580, 'Karasuma-dori Shiokoji-sagaru, Shimogyo-ku, Kyoto 600-8216, Japan', 1, '14:00', 60, 'Right at Kyoto Station. Perfect base for day trips.', null, 'ChIJUf6MDFcIAWARLihjKC9FWDY', 'https://www.granvia-kyoto.co.jp/', '+81 75-344-8888'],
    [t1, 'Fushimi Inari Taisha', 34.9671, 135.7727, '68 Fukakusa Yabunouchicho, Fushimi Ward, Kyoto 612-0882, Japan', 3, '07:00', 150, '10,000 vermillion torii gates. Start early for empty paths!', null, 'ChIJIW0JRbMIAWARPYEzP5LVHGE', 'http://inari.jp/', '+81 75-641-7331'],
    [t1, 'Kinkaku-ji (Golden Pavilion)', 35.0394, 135.7292, '1 Kinkakujicho, Kita Ward, Kyoto 603-8361, Japan', 3, '10:00', 60, 'The golden temple reflected in the mirror pond. Iconic photo spot.', null, 'ChIJvUbrwCCoAWAR5-uyAXPzBHg', null, '+81 75-461-0013'],
    [t1, 'Arashiyama Bamboo Grove', 35.0095, 135.6673, 'Sagatenryuji Susukinobabacho, Ukyo Ward, Kyoto 616-8385, Japan', 9, '09:00', 90, 'Magical bamboo forest. Best visited in the morning before the crowds.', null, 'ChIJFS4EvA6pAWARQsAPVijvW7I', null, null],
    [t1, 'Nishiki Market', 35.0050, 135.7647, 'Nishiki-koji Dori, Nakagyo Ward, Kyoto 604-8054, Japan', 2, '12:00', 90, 'Kyoto\'s kitchen street. Try the matcha ice cream and fresh mochi!', null, 'ChIJ09zzUigJAWARXzIdh1NE3hQ', 'http://www.kyoto-nishiki.or.jp/', null],
    [t1, 'Gion District', 35.0037, 135.7755, 'Gionmachi Minamigawa, Higashiyama Ward, Kyoto 605-0074, Japan', 3, '17:00', 120, 'Historic geisha district. Best chance of spotting a maiko in the evening.', null, 'ChIJ7WWWjfYJAWARGqEHAfXIzgQ', null, null],
  ];

  const t1pIds = t1places.map(p => Number(insertPlace.run(...p).lastInsertRowid));

  // Day 1: Hotel Check-in, Shibuya
  insertAssignment.run(t1days[0], t1pIds[0], 0);
  insertAssignment.run(t1days[0], t1pIds[2], 1);
  insertNote.run(t1days[0], t1, 'Pick up Pocket WiFi at airport', '13:00', 'Info', 0.5);
  // Day 2: Tsukiji, Senso-ji, Akihabara
  insertAssignment.run(t1days[1], t1pIds[3], 0);
  insertAssignment.run(t1days[1], t1pIds[1], 1);
  insertAssignment.run(t1days[1], t1pIds[5], 2);
  // Day 3: Meiji Shrine, free afternoon
  insertAssignment.run(t1days[2], t1pIds[4], 0);
  insertNote.run(t1days[2], t1, 'Explore Harajuku after the shrine', '12:00', 'MapPin', 1);
  // Day 4: Shinkansen to Kyoto, Hotel
  insertAssignment.run(t1days[3], t1pIds[6], 0);
  insertAssignment.run(t1days[3], t1pIds[7], 1);
  insertNote.run(t1days[3], t1, 'Sit on right side for Mt. Fuji views!', '08:30', 'Train', 0.5);
  // Day 5: Fushimi Inari, Nishiki Market
  insertAssignment.run(t1days[4], t1pIds[8], 0);
  insertAssignment.run(t1days[4], t1pIds[11], 1);
  // Day 6: Kinkaku-ji, Arashiyama
  insertAssignment.run(t1days[5], t1pIds[9], 0);
  insertAssignment.run(t1days[5], t1pIds[10], 1);
  // Day 7: Gion
  insertAssignment.run(t1days[6], t1pIds[12], 0);
  insertNote.run(t1days[6], t1, 'Last evening — farewell dinner at Pontocho Alley', '19:00', 'Star', 1);

  // Packing
  const t1packing: [string, number, string, number][] = [
    ['Passport', 1, 'Documents', 0], ['Japan Rail Pass', 1, 'Documents', 1],
    ['Power adapter Type A/B', 0, 'Electronics', 2], ['Camera + charger', 0, 'Electronics', 3],
    ['Comfortable walking shoes', 0, 'Clothing', 4], ['Rain jacket', 0, 'Clothing', 5],
    ['Sunscreen', 0, 'Toiletries', 6], ['Travel first aid kit', 0, 'Toiletries', 7],
    ['Pocket WiFi confirmation', 1, 'Electronics', 8], ['Yen cash', 0, 'Documents', 9],
  ];
  t1packing.forEach(p => insertPacking.run(t1, ...p));

  // Budget
  insertBudget.run(t1, 'Accommodation', 'Hotel Shinjuku (3 nights)', 67500, 2, 'Double room');
  insertBudget.run(t1, 'Accommodation', 'Hotel Granvia Kyoto (4 nights)', 102000, 2, 'Superior room');
  insertBudget.run(t1, 'Transport', 'Flights FRA-NRT return', 180000, 2, 'Lufthansa direct');
  insertBudget.run(t1, 'Transport', 'Japan Rail Pass (7 days)', 57000, 2, 'Ordinary');
  insertBudget.run(t1, 'Food', 'Daily food budget', 52500, 2, 'Approx. 7,500 JPY/day');
  insertBudget.run(t1, 'Activities', 'Temple entries & experiences', 18000, 2, null);

  // Reservations. reservation_time carries the full date, the way the booking
  // form writes it: a bare clock time is a different shape, and readers that
  // compare the column against a timestamp cannot tell the two apart (#1934).
  insertReservation.run(t1, t1days[0], 'Hotel Shinjuku Check-in', '2026-04-15T15:00', 'SG-2026-78432', 'confirmed', 'hotel', 'Shinjuku, Tokyo');
  insertReservation.run(t1, t1days[3], 'Shinkansen Tokyo → Kyoto', '2026-04-18T08:30', 'JR-NOZOMI-445', 'confirmed', 'transport', 'Tokyo Station');

  insertMember.run(t1, demoId, adminId);

  // --- Trip 2: 成都美食之旅 ---
  const trip2 = insertTrip.run(adminId, '成都美食之旅', '火锅、串串、宽窄巷子——在成都享受悠闲的美食与文化之旅。', '2026-05-21', '2026-05-24', 'CNY');
  const t2 = Number(trip2.lastInsertRowid);

  const t2days: number[] = [];
  for (let i = 0; i < 4; i++) {
    const d = insertDay.run(t2, i + 1, `2026-05-${21 + i}`);
    t2days.push(Number(d.lastInsertRowid));
  }

  const t2places: [number, string, number, number, string, number, string, number, string, string | null, string | null, string | null, string | null][] = [
    [t2, '成都香格里拉大酒店', 30.6321, 104.0790, '成都市锦江区滨江东路339号', 1, '14:00', 60, '入住时间下午三点，毗邻春熙路步行街。', null, null, 'https://www.shangri-la.com/chengdu/shangrila/', '028-8888-9999'],
    [t2, '宽窄巷子', 30.6713, 104.0573, '成都市青羊区宽窄巷子', 3, '10:00', 120, '成都最具代表性的历史文化街区，品尝三大炮、糖油果子等小吃。', null, null, null, null],
    [t2, '锦里古街', 30.6530, 104.0491, '成都市武侯区锦里西街', 3, '15:00', 90, '紧邻武侯祠，体验三国文化。夜晚灯笼亮起特别漂亮。', null, null, null, null],
    [t2, '陈麻婆豆腐（总店）', 30.6550, 104.0550, '成都市青羊区西玉龙街197号', 2, '12:00', 60, '百年老店，正宗麻婆豆腐的发源地。', null, null, 'http://www.chen-mapo.com/', null],
    [t2, '人民公园', 30.6612, 104.0631, '成都市青羊区少城路12号', 9, '10:00', 90, '在鹤鸣茶社喝一碗盖碗茶，体验成都慢生活。', null, null, null, null],
    [t2, '武侯祠', 30.6456, 104.0491, '成都市武侯区武侯祠大街231号', 3, '09:00', 90, '中国唯一的君臣合祀祠庙，纪念诸葛亮和刘备。', null, null, 'http://www.wuhouci.org.cn/', '028-8555-2395'],
    [t2, '成都大熊猫繁育研究基地', 30.7325, 104.1445, '成都市成华区熊猫大道1375号', 3, '08:00', 180, '建议早上八点入园，上午是熊猫最活跃的时间。', null, null, 'http://www.panda.org.cn/', '028-8351-0000'],
    [t2, '建设路小吃街', 30.6650, 104.1120, '成都市成华区建设巷', 7, '20:00', 120, '本地人最爱的小吃街，降龙爪爪、高姐锡纸烤脑花都值得尝。', null, null, null, null],
  ];

  const t2pIds = t2places.map(p => Number(insertPlace.run(...p).lastInsertRowid));

  // Day 1: 到达，人民公园，建设路
  insertAssignment.run(t2days[0], t2pIds[0], 0);
  insertAssignment.run(t2days[0], t2pIds[4], 1);
  insertAssignment.run(t2days[0], t2pIds[7], 2);
  // Day 2: 熊猫基地，陈麻婆豆腐，宽窄巷子
  insertAssignment.run(t2days[1], t2pIds[6], 0);
  insertAssignment.run(t2days[1], t2pIds[3], 1);
  insertAssignment.run(t2days[1], t2pIds[1], 2);
  insertNote.run(t2days[1], t2, '门票需要提前在公众号预约', '08:00', 'Ticket', 0.5);
  // Day 3: 武侯祠，锦里
  insertAssignment.run(t2days[2], t2pIds[5], 0);
  insertAssignment.run(t2days[2], t2pIds[2], 1);
  // Day 4: 宽窄巷子闲逛，返程
  insertAssignment.run(t2days[3], t2pIds[1], 0);
  insertNote.run(t2days[3], t2, '下午的航班，上午还能逛逛春熙路', '13:00', 'Plane', 1);

  // Packing
  ['身份证', '防晒霜', '舒适的步行鞋', '充电宝', '相机', '遮阳帽'].forEach((name, i) => {
    insertPacking.run(t2, name, 0, i < 1 ? '证件' : '其他', i);
  });

  // Budget
  insertBudget.run(t2, '住宿', '成都香格里拉大酒店（3晚）', 2700, 2, '豪华大床房');
  insertBudget.run(t2, '交通', '机票往返', 1600, 2, '经济舱');
  insertBudget.run(t2, '餐饮', '餐饮美食', 1200, 2, '约400元/天');
  insertBudget.run(t2, '活动', '熊猫基地门票 + 武侯祠门票', 200, 2, '线上购票');

  insertReservation.run(t2, t2days[0], '成都香格里拉大酒店入住', '2026-05-21T15:00', 'SH-2026-78432', 'confirmed', 'hotel', '成都市锦江区');

  insertMember.run(t2, demoId, adminId);

  // --- Trip 3: 杭州西湖之旅 ---
  const trip3 = insertTrip.run(adminId, '杭州西湖之旅', '欲把西湖比西子，淡妆浓抹总相宜——在杭州感受江南水乡的诗情画意。', '2026-09-18', '2026-09-22', 'CNY');
  const t3 = Number(trip3.lastInsertRowid);

  const t3days: number[] = [];
  for (let i = 0; i < 5; i++) {
    const d = insertDay.run(t3, i + 1, `2026-09-${18 + i}`);
    t3days.push(Number(d.lastInsertRowid));
  }

  const t3places: [number, string, number, number, string, number, string, number, string, string | null, string | null, string | null, string | null][] = [
    [t3, '杭州西湖国宾馆', 30.2530, 120.1340, '杭州市西湖区杨公堤18号', 1, '15:00', 60, '坐落在西湖边，拥有无敌湖景。环境清幽雅致。', null, null, 'http://www.xihuhotel.com/', '0571-8797-9889'],
    [t3, '西湖', 30.2420, 120.1480, '杭州市西湖区', 9, '09:00', 180, '苏堤春晓、断桥残雪、三潭印月——十景各有千秋。建议骑行环湖。', null, null, null, null],
    [t3, '灵隐寺', 30.2410, 120.1010, '杭州市西湖区法云弄1号', 3, '08:00', 120, '杭州最著名的古刹，千年古刹香火旺盛。先买飞来峰景区门票。', null, null, 'http://www.lingyin.net/', '0571-8796-8665'],
    [t3, '楼外楼（孤山路店）', 30.2620, 120.1390, '杭州市西湖区孤山路30号', 2, '12:00', 90, '百年老字号，必点西湖醋鱼、龙井虾仁、东坡肉。', null, null, null, null],
    [t3, '河坊街', 30.2440, 120.1700, '杭州市上城区河坊街', 3, '15:00', 90, '清河坊历史文化街区，品尝定胜糕、葱包桧、片儿川。', null, null, null, null],
    [t3, '千岛湖', 29.6042, 119.0155, '杭州市淳安县千岛湖镇', 9, '07:00', 480, '千岛碧水画中游，建议报一日游或自驾。五小时车程。', null, null, null, null],
    [t3, '龙井村', 30.2130, 120.1280, '杭州市西湖区龙井村', 3, '10:00', 90, '中国十大名茶之首的产地，品尝新炒的龙井茶。', null, null, null, null],
    [t3, '南宋御街', 30.2500, 120.1710, '杭州市上城区中山中路', 3, '14:00', 60, '南宋时期御用街道，感受宋韵文化的魅力。', null, null, null, null],
    [t3, '知味观（总店）', 30.2530, 120.1650, '杭州市上城区仁和路83号', 2, '18:00', 60, '杭州最著名的老字号小吃店，必点小笼包、猫耳朵、幸福双。', null, null, null, null],
    [t3, '京杭大运河（拱宸桥段）', 30.3200, 120.1420, '杭州市拱墅区拱宸桥', 3, '16:00', 90, '世界文化遗产，沿运河步道散步，看老杭州的生活气息。', null, null, null, null],
  ];

  const t3pIds = t3places.map(p => Number(insertPlace.run(...p).lastInsertRowid));

  // Day 1: 到达，西湖夜游
  insertAssignment.run(t3days[0], t3pIds[0], 0);
  insertAssignment.run(t3days[0], t3pIds[1], 1);
  insertAssignment.run(t3days[0], t3pIds[8], 2);
  // Day 2: 灵隐寺，龙井村，知味观
  insertAssignment.run(t3days[1], t3pIds[2], 0);
  insertAssignment.run(t3days[1], t3pIds[6], 1);
  insertAssignment.run(t3days[1], t3pIds[8], 2);
  insertNote.run(t3days[1], t3, '灵隐寺建议早上八点前到达，避开人流', '07:30', 'MapPin', 0.5);
  // Day 3: 西湖环湖骑行，楼外楼午餐
  insertAssignment.run(t3days[2], t3pIds[1], 0);
  insertAssignment.run(t3days[2], t3pIds[3], 1);
  insertNote.run(t3days[2], t3, '租自行车环湖，记得带好防晒', '09:00', 'Bike', 1);
  // Day 4: 千岛湖一日游
  insertAssignment.run(t3days[3], t3pIds[5], 0);
  insertNote.run(t3days[3], t3, '建议报一日游，早上六点半出发', '06:30', 'Car', 2);
  // Day 5: 河坊街，南宋御街，返程
  insertAssignment.run(t3days[4], t3pIds[4], 0);
  insertAssignment.run(t3days[4], t3pIds[7], 1);
  insertNote.run(t3days[4], t3, '下午的高铁，上午买些伴手礼', '13:00', 'Train', 0);

  // Packing
  const t3packing: [string, number, string, number][] = [
    ['身份证', 1, '证件', 0], ['学生证', 1, '证件', 1],
    ['防晒霜', 0, '日用', 2], ['舒适的步行鞋', 0, '服装', 3],
    ['轻便外套', 0, '服装', 4], ['充电宝', 0, '电子', 5],
    ['相机', 0, '电子', 6], ['雨伞', 0, '日用', 7],
  ];
  t3packing.forEach(p => insertPacking.run(t3, ...p));

  // Budget
  insertBudget.run(t3, '住宿', '杭州西湖国宾馆（4晚）', 4800, 2, '湖景大床房');
  insertBudget.run(t3, '交通', '高铁往返', 1200, 2, '二等座');
  insertBudget.run(t3, '餐饮', '餐饮美食', 2000, 2, '约400元/天');
  insertBudget.run(t3, '活动', '灵隐寺 + 千岛湖一日游 + 其他', 600, 2, '门票及导览');
  insertBudget.run(t3, '购物', '龙井茶及伴手礼', 500, 2, '特产');

  insertReservation.run(t3, t3days[0], '杭州西湖国宾馆入住', '2026-09-18T15:00', 'XH-2026-55891', 'confirmed', 'hotel', '杭州市西湖区杨公堤18号');
  insertReservation.run(t3, t3days[3], '千岛湖一日游', '2026-09-21T06:30', 'QDH-2026-3347', 'confirmed', 'transport', '酒店出发');

  insertMember.run(t3, demoId, adminId);

  console.log('[Demo] 3 example trips seeded and shared with demo user');
}

export { seedDemoData };
