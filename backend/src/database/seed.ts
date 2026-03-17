#!/usr/bin/env node

import { Pool } from 'pg';
import { getDatabaseConfig } from './config';
import { v4 as uuidv4 } from 'uuid';

interface SeedDelegate {
  id: string;
  delegate_number: number;
  name: string;
  location: string;
  gender: 'Male' | 'Female' | 'Other';
  age_bracket: '20s' | '30s' | '40s' | '50s' | '60s' | '70s+';
  race_category: 'White_Persian' | 'Non_White_Non_Persian';
  has_spoken: boolean;
}

interface SeedSession {
  id: string;
  name: string;
  is_tracked: boolean;
  garden_state: number;
}

// Sample data generators
const firstNames = {
  Male: [
    'James',
    'John',
    'Robert',
    'Michael',
    'William',
    'David',
    'Richard',
    'Joseph',
    'Thomas',
    'Charles',
  ],
  Female: [
    'Mary',
    'Patricia',
    'Jennifer',
    'Linda',
    'Elizabeth',
    'Barbara',
    'Susan',
    'Jessica',
    'Sarah',
    'Karen',
  ],
  Other: [
    'Alex',
    'Jordan',
    'Taylor',
    'Morgan',
    'Casey',
    'Riley',
    'Jamie',
    'Avery',
    'Quinn',
    'Sage',
  ],
};

const lastNames = [
  'Smith',
  'Johnson',
  'Williams',
  'Brown',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
  'Hernandez',
  'Lopez',
  'Gonzalez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Taylor',
  'Moore',
  'Jackson',
  'Martin',
];

const locations = [
  'California',
  'Texas',
  'Florida',
  'New York',
  'Pennsylvania',
  'Illinois',
  'Ohio',
  'Georgia',
  'North Carolina',
  'Michigan',
  'New Jersey',
  'Virginia',
  'Washington',
  'Arizona',
  'Massachusetts',
];

function generateDelegates(count: number): SeedDelegate[] {
  const delegates: SeedDelegate[] = [];
  const genders: Array<'Male' | 'Female' | 'Other'> = ['Male', 'Female', 'Other'];
  const ageBrackets: Array<'20s' | '30s' | '40s' | '50s' | '60s' | '70s+'> = [
    '20s',
    '30s',
    '40s',
    '50s',
    '60s',
    '70s+',
  ];
  const raceCategories: Array<'White_Persian' | 'Non_White_Non_Persian'> = [
    'White_Persian',
    'Non_White_Non_Persian',
  ];

  for (let i = 1; i <= count; i++) {
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const firstNameList = firstNames[gender];
    const firstName = firstNameList[Math.floor(Math.random() * firstNameList.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

    delegates.push({
      id: uuidv4(),
      delegate_number: i,
      name: `${firstName} ${lastName}`,
      location: locations[Math.floor(Math.random() * locations.length)],
      gender,
      age_bracket: ageBrackets[Math.floor(Math.random() * ageBrackets.length)],
      race_category: raceCategories[Math.floor(Math.random() * raceCategories.length)],
      has_spoken: Math.random() < 0.2, // 20% have spoken
    });
  }

  return delegates;
}

async function seedDatabase() {
  const pool = new Pool(getDatabaseConfig());

  try {
    console.log('Starting database seeding...');

    // Clear existing data (in reverse order of dependencies)
    console.log('Clearing existing data...');
    await pool.query('DELETE FROM speaking_instances');
    await pool.query('DELETE FROM queue');
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM delegates');

    // Generate seed data
    const delegates = generateDelegates(200);
    const sessions: SeedSession[] = [
      { id: uuidv4(), name: 'Morning Session - Day 1', is_tracked: false, garden_state: 0 },
      { id: uuidv4(), name: 'Afternoon Session - Day 1', is_tracked: false, garden_state: 5 },
      { id: uuidv4(), name: 'Evening Session - Day 1', is_tracked: false, garden_state: 10 },
      { id: uuidv4(), name: 'Morning Session - Day 2', is_tracked: true, garden_state: 15 },
      { id: uuidv4(), name: 'Main Convention Hall', is_tracked: true, garden_state: 20 },
    ];

    // Insert delegates
    console.log(`Inserting ${delegates.length} delegates...`);
    for (const delegate of delegates) {
      await pool.query(
        `INSERT INTO delegates (id, delegate_number, name, location, gender, age_bracket, race_category, has_spoken)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          delegate.id,
          delegate.delegate_number,
          delegate.name,
          delegate.location,
          delegate.gender,
          delegate.age_bracket,
          delegate.race_category,
          delegate.has_spoken,
        ]
      );
    }

    // Insert sessions
    console.log(`Inserting ${sessions.length} sessions...`);
    for (const session of sessions) {
      await pool.query(
        `INSERT INTO sessions (id, name, is_tracked, garden_state)
         VALUES ($1, $2, $3, $4)`,
        [session.id, session.name, session.is_tracked, session.garden_state]
      );
    }

    // Add some delegates to the active session queue
    const activeSession = sessions[4]; // Main Convention Hall
    const queueDelegates = delegates.slice(0, 10);

    console.log('Adding delegates to queue...');
    for (let i = 0; i < queueDelegates.length; i++) {
      const status = i === 0 ? 'speaking' : i === 1 ? 'on_deck' : 'waiting';
      await pool.query(
        `INSERT INTO queue (session_id, delegate_id, position, status)
         VALUES ($1, $2, $3, $4)`,
        [activeSession.id, queueDelegates[i].id, i + 1, status]
      );
    }

    // Add some historical speaking instances
    console.log('Adding speaking history...');
    const pastSession = sessions[0];
    const historicalSpeakers = delegates.filter((d) => d.has_spoken).slice(0, 5);

    for (let i = 0; i < historicalSpeakers.length; i++) {
      const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      startTime.setHours(9 + i, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setMinutes(startTime.getMinutes() + Math.floor(Math.random() * 10) + 2); // 2-12 minutes

      await pool.query(
        `INSERT INTO speaking_instances (delegate_id, session_id, start_time, end_time, position_in_queue, is_tracked)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [historicalSpeakers[i].id, pastSession.id, startTime, endTime, i + 1, true]
      );
    }

    console.log('Database seeding completed successfully.');
    console.log(`✓ ${delegates.length} delegates created`);
    console.log(`✓ ${sessions.length} sessions created`);
    console.log(`✓ ${queueDelegates.length} delegates added to queue`);
    console.log(`✓ ${historicalSpeakers.length} speaking history records created`);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  seedDatabase();
}

export default seedDatabase;
