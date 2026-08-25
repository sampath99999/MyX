-- MyX Meals — what you ate, and what it added up to.
--
-- The design constraint that shapes everything here is friction. A food log is
-- abandoned in a week if a meal takes forty seconds to record, and an abandoned
-- log has no features at all. So the schema is built for repeat logging: foods
-- are a reusable library, entries copy what they need from that library, and a
-- day is one indexed read.
--
-- Two conventions carried over from Money.
--
-- Numbers are integers. Calories are whole; protein, carbs, fat and fibre are
-- stored in centigrams (100 = 1.00 g). A day's total is a sum of twenty rows and
-- float drift in a running total is the same bug as counting rupees in floats,
-- wearing a different hat.
--
-- Entries copy their nutrition rather than joining it. meal_entries.kcal is what
-- that portion actually contained, written once at log time. Correcting a food's
-- calories next month must not silently rewrite what last month says you ate —
-- the same reason a transaction stores its amount instead of deriving it.

-- The food library. user_id NULL means a built-in, visible to everyone; a row
-- with a user_id belongs to that account alone. Editing a built-in copies it
-- into a personal row rather than changing it for everybody, which matters
-- because the seeded values below are good estimates and not much more.
CREATE TABLE IF NOT EXISTS foods (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,                        -- NULL = built-in
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'other',  -- groups the picker
  -- How a person actually measures this: "1 idli", "1 katori", "1 glass".
  -- Grams are a barrier and katoris are how the food is really thought about,
  -- so the household measure is the primary unit and grams are a footnote.
  serving_label TEXT NOT NULL,
  serving_grams INTEGER,                        -- nullable, informational only
  kcal          INTEGER NOT NULL,
  protein_cg    INTEGER NOT NULL DEFAULT 0,     -- centigrams: 100 = 1.00 g
  carbs_cg      INTEGER NOT NULL DEFAULT 0,
  fat_cg        INTEGER NOT NULL DEFAULT 0,
  fibre_cg      INTEGER NOT NULL DEFAULT 0,
  /*
    Set when a personal row was copied from a built-in. Only used to stop the
    picker showing both the original and the edited copy — the copy wins.
  */
  copied_from   INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Search runs on every keystroke of the picker, over built-ins plus this user's
-- own rows, so both halves of that OR need to be cheap.
CREATE INDEX IF NOT EXISTS idx_foods_user ON foods(user_id, name);
CREATE INDEX IF NOT EXISTS idx_foods_builtin ON foods(name) WHERE user_id IS NULL;

-- One row per thing eaten. food_id is kept for "log this again" but is nullable
-- and ON DELETE SET NULL: deleting a food from the library must not delete the
-- history of having eaten it.
CREATE TABLE IF NOT EXISTS meal_entries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  logged_on     TEXT NOT NULL,                  -- YYYY-MM-DD
  meal          TEXT NOT NULL,                  -- breakfast | lunch | dinner | snack
  food_id       INTEGER,
  name          TEXT NOT NULL,                  -- copied at log time
  serving_label TEXT NOT NULL,                  -- copied at log time
  -- Quantity ×100, so half a serving is 50 and one and a half is 150. Integers
  -- again, for the same reason as the macros.
  quantity_cx   INTEGER NOT NULL DEFAULT 100,
  -- Already multiplied by quantity. Summing a day never needs to do arithmetic
  -- beyond addition.
  kcal          INTEGER NOT NULL,
  protein_cg    INTEGER NOT NULL DEFAULT 0,
  carbs_cg      INTEGER NOT NULL DEFAULT 0,
  fat_cg        INTEGER NOT NULL DEFAULT 0,
  fibre_cg      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE SET NULL
);

-- Every read of this table is "one user, one day" or "one user, a date range".
CREATE INDEX IF NOT EXISTS idx_meal_entries_day ON meal_entries(user_id, logged_on);
-- Recents and frequents in the picker, which is the fast path for repeat logging.
CREATE INDEX IF NOT EXISTS idx_meal_entries_food ON meal_entries(user_id, food_id);

-- "My usual breakfast" — a saved combination, logged in one tap.
CREATE TABLE IF NOT EXISTS meal_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  name       TEXT NOT NULL,
  meal       TEXT NOT NULL DEFAULT 'breakfast',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meal_template_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  food_id     INTEGER NOT NULL,
  quantity_cx INTEGER NOT NULL DEFAULT 100,
  FOREIGN KEY (template_id) REFERENCES meal_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (food_id) REFERENCES foods(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_templates_user ON meal_templates(user_id, meal);
CREATE INDEX IF NOT EXISTS idx_meal_template_items ON meal_template_items(template_id);

-- Daily goals, plus the optional profile they can be derived from. One row per
-- account, so the primary key is the user.
CREATE TABLE IF NOT EXISTS nutrition_targets (
  user_id     INTEGER PRIMARY KEY,
  kcal        INTEGER NOT NULL,
  protein_cg  INTEGER NOT NULL,
  carbs_cg    INTEGER NOT NULL,
  fat_cg      INTEGER NOT NULL,
  -- All optional: targets can be typed in directly and the profile left empty.
  -- Kept so the numbers can be recomputed when weight or goal changes, rather
  -- than the user having to remember what they were derived from.
  sex         TEXT,                             -- male | female
  age         INTEGER,
  height_cm   INTEGER,
  weight_g    INTEGER,
  activity    TEXT,                             -- sedentary | light | moderate | active | very_active
  goal        TEXT,                             -- lose | maintain | gain
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Weight, which is what makes a calorie number mean anything. One reading per
-- day: a second entry for the same date replaces the first rather than making
-- the chart lumpy with intra-day noise that reflects water, not fat.
CREATE TABLE IF NOT EXISTS weight_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  logged_on  TEXT NOT NULL,                     -- YYYY-MM-DD
  grams      INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, logged_on),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_weight_log_user ON weight_log(user_id, logged_on DESC);

-- ---------------------------------------------------------------------------
-- The built-in food library.
--
-- Everyday Indian food in the portions people actually use - an idli, a katori,
-- a glass - because nobody weighs their sambar, and a library that insists on
-- grams goes unused.
--
-- These are good estimates, not measurements. Home cooking varies with the hand
-- that made it, and anything fried varies a lot; treat them as within roughly
-- 15% and correct the ones you eat often. Editing a built-in creates a personal
-- copy (see foods.copied_from), so a correction belongs to you and does not
-- rewrite the shared row for anyone else.
-- ---------------------------------------------------------------------------

INSERT INTO foods (user_id, name, category, serving_label, serving_grams, kcal, protein_cg, carbs_cg, fat_cg, fibre_cg) VALUES
  (NULL, 'Idli', 'tiffin', '1 idli', 50, 58, 160, 1200, 20, 60),
  (NULL, 'Plain dosa', 'tiffin', '1 dosa', 80, 133, 270, 2200, 370, 100),
  (NULL, 'Masala dosa', 'tiffin', '1 dosa', 150, 250, 450, 3800, 900, 250),
  (NULL, 'Rava dosa', 'tiffin', '1 dosa', 100, 180, 320, 2500, 700, 100),
  (NULL, 'Set dosa', 'tiffin', '2 dosas', 120, 200, 450, 3200, 600, 150),
  (NULL, 'Uttapam', 'tiffin', '1 uttapam', 120, 190, 450, 3000, 600, 180),
  (NULL, 'Medu vada', 'tiffin', '1 vada', 45, 138, 350, 1500, 700, 150),
  (NULL, 'Upma', 'tiffin', '1 katori', 150, 192, 450, 3000, 600, 200),
  (NULL, 'Poha', 'tiffin', '1 katori', 150, 180, 350, 3200, 450, 180),
  (NULL, 'Ven pongal', 'tiffin', '1 katori', 150, 220, 600, 3300, 700, 200),
  (NULL, 'Appam', 'tiffin', '1 appam', 70, 120, 220, 2200, 250, 80),
  (NULL, 'Idiyappam', 'tiffin', '2 pieces', 100, 180, 350, 3800, 100, 150),
  (NULL, 'Puttu', 'tiffin', '1 katori', 150, 200, 400, 4000, 300, 250),
  (NULL, 'Paniyaram', 'tiffin', '4 pieces', 100, 160, 350, 2400, 550, 120),
  (NULL, 'Semiya upma', 'tiffin', '1 katori', 150, 200, 450, 3400, 500, 120),
  (NULL, 'Sambar', 'curry', '1 katori', 150, 105, 450, 1400, 350, 350),
  (NULL, 'Rasam', 'curry', '1 katori', 150, 60, 200, 800, 200, 120),
  (NULL, 'Coconut chutney', 'curry', '2 tbsp', 40, 90, 130, 350, 800, 150),
  (NULL, 'Tomato chutney', 'curry', '2 tbsp', 40, 45, 80, 500, 250, 100),
  (NULL, 'Peanut chutney', 'curry', '2 tbsp', 40, 100, 350, 400, 800, 150),
  (NULL, 'Podi with oil', 'curry', '1 tbsp', 15, 80, 250, 500, 550, 150),
  (NULL, 'Chapati', 'bread', '1 chapati', 40, 120, 320, 2000, 300, 250),
  (NULL, 'Phulka', 'bread', '1 phulka', 30, 85, 250, 1600, 100, 200),
  (NULL, 'Plain paratha', 'bread', '1 paratha', 70, 210, 450, 2800, 900, 250),
  (NULL, 'Aloo paratha', 'bread', '1 paratha', 120, 290, 600, 4000, 1200, 300),
  (NULL, 'Naan', 'bread', '1 naan', 90, 260, 800, 4500, 500, 200),
  (NULL, 'Tandoori roti', 'bread', '1 roti', 60, 140, 450, 2600, 200, 300),
  (NULL, 'Puri', 'bread', '1 puri', 25, 100, 200, 1200, 500, 80),
  (NULL, 'Bhatura', 'bread', '1 bhatura', 80, 250, 550, 3500, 1000, 150),
  (NULL, 'Bread slice', 'bread', '1 slice', 28, 70, 230, 1300, 90, 80),
  (NULL, 'Brown bread slice', 'bread', '1 slice', 28, 68, 300, 1200, 100, 180),
  (NULL, 'Butter toast', 'bread', '2 slices', 70, 220, 500, 2600, 1000, 160),
  (NULL, 'Pav', 'bread', '1 pav', 45, 130, 400, 2500, 150, 100),
  (NULL, 'Steamed rice', 'rice', '1 katori', 150, 195, 400, 4300, 40, 60),
  (NULL, 'Brown rice', 'rice', '1 katori', 150, 180, 400, 3800, 150, 250),
  (NULL, 'Curd rice', 'rice', '1 katori', 180, 180, 500, 2800, 500, 80),
  (NULL, 'Lemon rice', 'rice', '1 katori', 180, 230, 400, 3800, 700, 150),
  (NULL, 'Tamarind rice', 'rice', '1 katori', 180, 250, 450, 4000, 800, 200),
  (NULL, 'Jeera rice', 'rice', '1 katori', 150, 230, 400, 4000, 600, 100),
  (NULL, 'Veg pulao', 'rice', '1 katori', 180, 260, 550, 4200, 800, 250),
  (NULL, 'Veg biryani', 'rice', '1 plate', 250, 420, 900, 6500, 1400, 400),
  (NULL, 'Chicken biryani', 'rice', '1 plate', 300, 550, 2600, 6200, 2200, 300),
  (NULL, 'Mutton biryani', 'rice', '1 plate', 300, 620, 2800, 6200, 3000, 300),
  (NULL, 'Egg fried rice', 'rice', '1 plate', 250, 400, 1200, 5500, 1400, 200),
  (NULL, 'Bisi bele bath', 'rice', '1 katori', 200, 290, 800, 4500, 900, 400),
  (NULL, 'Dal tadka', 'dal', '1 katori', 150, 150, 700, 1800, 550, 400),
  (NULL, 'Dal fry', 'dal', '1 katori', 150, 170, 750, 1900, 700, 400),
  (NULL, 'Toor dal plain', 'dal', '1 katori', 150, 130, 700, 1800, 250, 400),
  (NULL, 'Rajma curry', 'dal', '1 katori', 150, 180, 800, 2600, 450, 700),
  (NULL, 'Chole', 'dal', '1 katori', 150, 210, 900, 2800, 700, 750),
  (NULL, 'Black chana curry', 'dal', '1 katori', 150, 190, 950, 2600, 500, 800),
  (NULL, 'Boiled chana', 'dal', '1 katori', 120, 180, 900, 2800, 300, 800),
  (NULL, 'Sprouts salad', 'dal', '1 katori', 100, 100, 800, 1600, 100, 500),
  (NULL, 'Dal makhani', 'dal', '1 katori', 150, 280, 900, 2400, 1600, 600),
  (NULL, 'Aloo gobi', 'veg', '1 katori', 150, 140, 300, 1500, 800, 350),
  (NULL, 'Bhindi fry', 'veg', '1 katori', 150, 130, 250, 1000, 900, 350),
  (NULL, 'Mixed veg curry', 'veg', '1 katori', 150, 130, 350, 1400, 700, 400),
  (NULL, 'Cabbage poriyal', 'veg', '1 katori', 150, 90, 250, 1000, 450, 350),
  (NULL, 'Beans poriyal', 'veg', '1 katori', 150, 100, 300, 1100, 500, 400),
  (NULL, 'Baingan bharta', 'veg', '1 katori', 150, 150, 300, 1300, 1000, 450),
  (NULL, 'Palak paneer', 'veg', '1 katori', 150, 240, 1100, 900, 1800, 300),
  (NULL, 'Paneer butter masala', 'veg', '1 katori', 150, 320, 1200, 1200, 2500, 200),
  (NULL, 'Aloo sabzi', 'veg', '1 katori', 150, 160, 300, 2400, 600, 300),
  (NULL, 'Avial', 'veg', '1 katori', 150, 160, 350, 1200, 1100, 350),
  (NULL, 'Salad plate', 'veg', '1 plate', 150, 50, 200, 900, 50, 300),
  (NULL, 'Raita', 'veg', '1 katori', 150, 80, 400, 700, 400, 80),
  (NULL, 'Boiled egg', 'egg', '1 egg', 50, 78, 630, 60, 530, 0),
  (NULL, 'Omelette (2 eggs)', 'egg', '1 omelette', 130, 190, 1300, 150, 1500, 20),
  (NULL, 'Egg bhurji', 'egg', '1 katori', 130, 220, 1300, 400, 1700, 80),
  (NULL, 'Egg curry', 'egg', '1 katori (2 eggs)', 200, 250, 1400, 600, 1900, 150),
  (NULL, 'Egg white (boiled)', 'egg', '1 white', 33, 17, 360, 20, 10, 0),
  (NULL, 'Chicken curry', 'nonveg', '1 katori', 150, 240, 2200, 600, 1400, 100),
  (NULL, 'Butter chicken', 'nonveg', '1 katori', 150, 330, 2200, 900, 2300, 100),
  (NULL, 'Chicken tikka', 'nonveg', '4 pieces', 120, 220, 2800, 400, 1000, 50),
  (NULL, 'Grilled chicken breast', 'nonveg', '100 g', 100, 165, 3100, 0, 360, 0),
  (NULL, 'Chicken 65', 'nonveg', '1 plate', 150, 320, 2400, 1400, 1900, 100),
  (NULL, 'Fish curry', 'nonveg', '1 katori', 150, 200, 2000, 500, 1100, 80),
  (NULL, 'Fish fry', 'nonveg', '1 piece', 100, 180, 2000, 500, 900, 30),
  (NULL, 'Prawn curry', 'nonveg', '1 katori', 150, 190, 1900, 600, 1000, 80),
  (NULL, 'Mutton curry', 'nonveg', '1 katori', 150, 300, 2200, 500, 2100, 100),
  (NULL, 'Chicken keema', 'nonveg', '1 katori', 150, 280, 2000, 600, 2000, 120),
  (NULL, 'Samosa', 'snack', '1 samosa', 70, 260, 400, 3000, 1400, 200),
  (NULL, 'Vada pav', 'snack', '1 piece', 120, 300, 700, 4500, 1000, 300),
  (NULL, 'Pav bhaji', 'snack', '1 plate', 250, 400, 900, 5200, 1700, 600),
  (NULL, 'Pani puri', 'snack', '6 pieces', 120, 200, 400, 3400, 600, 250),
  (NULL, 'Bhel puri', 'snack', '1 plate', 120, 220, 500, 3600, 700, 300),
  (NULL, 'Dhokla', 'snack', '2 pieces', 100, 150, 500, 2200, 400, 200),
  (NULL, 'Onion pakora', 'snack', '4 pieces', 80, 220, 500, 2000, 1300, 250),
  (NULL, 'Maggi noodles', 'snack', '1 pack', 70, 320, 700, 4500, 1200, 200),
  (NULL, 'Parle-G biscuits', 'snack', '4 biscuits', 32, 138, 220, 2200, 450, 40),
  (NULL, 'Marie biscuits', 'snack', '4 biscuits', 24, 100, 180, 1700, 280, 40),
  (NULL, 'Rusk', 'snack', '2 pieces', 30, 120, 250, 2000, 300, 60),
  (NULL, 'Veg sandwich', 'snack', '1 sandwich', 150, 250, 700, 3800, 800, 350),
  (NULL, 'Potato chips', 'snack', '1 small pack', 30, 160, 200, 1500, 1000, 120),
  (NULL, 'Popcorn', 'snack', '1 bowl', 30, 120, 350, 2000, 350, 400),
  (NULL, 'Murukku', 'snack', '2 pieces', 40, 200, 350, 2200, 1100, 150),
  (NULL, 'Mixture', 'snack', '1 handful', 30, 160, 400, 1500, 1000, 200),
  (NULL, 'Peanut chikki', 'snack', '1 piece', 30, 145, 400, 1700, 700, 120),
  (NULL, 'Gulab jamun', 'sweet', '1 piece', 40, 150, 200, 2100, 650, 20),
  (NULL, 'Rasgulla', 'sweet', '1 piece', 50, 106, 250, 2000, 150, 0),
  (NULL, 'Jalebi', 'sweet', '1 piece', 35, 150, 100, 2500, 550, 10),
  (NULL, 'Besan laddu', 'sweet', '1 laddu', 45, 185, 400, 2200, 900, 150),
  (NULL, 'Mysore pak', 'sweet', '1 piece', 40, 180, 250, 2000, 1000, 50),
  (NULL, 'Kaju katli', 'sweet', '2 pieces', 30, 160, 300, 1800, 800, 50),
  (NULL, 'Kheer', 'sweet', '1 katori', 150, 220, 550, 3200, 800, 50),
  (NULL, 'Gajar halwa', 'sweet', '1 katori', 150, 250, 450, 3200, 1200, 250),
  (NULL, 'Payasam', 'sweet', '1 katori', 150, 230, 450, 3400, 850, 60),
  (NULL, 'Ice cream', 'sweet', '1 scoop', 65, 137, 230, 1600, 700, 50),
  (NULL, 'Dark chocolate', 'sweet', '4 squares', 30, 170, 200, 1300, 1200, 300),
  (NULL, 'Milk chocolate', 'sweet', '1 small bar', 40, 215, 300, 2400, 1200, 120),
  (NULL, 'Sugar', 'sweet', '1 tsp', 5, 20, 0, 500, 0, 0),
  (NULL, 'Honey', 'sweet', '1 tsp', 7, 21, 0, 580, 0, 0),
  (NULL, 'Filter coffee', 'drink', '1 cup', 150, 90, 300, 1100, 350, 0),
  (NULL, 'Tea with milk', 'drink', '1 cup', 150, 70, 170, 1000, 240, 0),
  (NULL, 'Black coffee', 'drink', '1 cup', 150, 5, 30, 80, 0, 0),
  (NULL, 'Green tea', 'drink', '1 cup', 200, 2, 0, 40, 0, 0),
  (NULL, 'Full fat milk', 'drink', '1 glass', 200, 130, 640, 960, 680, 0),
  (NULL, 'Toned milk', 'drink', '1 glass', 200, 100, 640, 980, 300, 0),
  (NULL, 'Buttermilk', 'drink', '1 glass', 200, 40, 250, 450, 120, 0),
  (NULL, 'Sweet lassi', 'drink', '1 glass', 250, 220, 700, 3200, 700, 0),
  (NULL, 'Coconut water', 'drink', '1 glass', 250, 45, 150, 900, 50, 0),
  (NULL, 'Fresh lime soda', 'drink', '1 glass', 250, 90, 20, 2300, 0, 20),
  (NULL, 'Cola', 'drink', '1 can', 330, 139, 0, 3500, 0, 0),
  (NULL, 'Orange juice', 'drink', '1 glass', 250, 110, 170, 2600, 50, 50),
  (NULL, 'Mango shake', 'drink', '1 glass', 300, 250, 600, 4500, 500, 150),
  (NULL, 'Whey protein shake', 'drink', '1 scoop', 30, 120, 2400, 300, 150, 50),
  (NULL, 'Beer', 'alcohol', '1 bottle', 330, 145, 160, 1100, 0, 0),
  (NULL, 'Whisky', 'alcohol', '1 peg (30 ml)', 30, 70, 0, 0, 0, 0),
  (NULL, 'Red wine', 'alcohol', '1 glass', 150, 125, 10, 400, 0, 0),
  (NULL, 'Water', 'drink', '1 glass', 250, 0, 0, 0, 0, 0),
  (NULL, 'Curd', 'dairy', '1 katori', 150, 90, 500, 700, 450, 0),
  (NULL, 'Greek yoghurt', 'dairy', '1 katori', 150, 130, 1500, 600, 500, 0),
  (NULL, 'Paneer', 'dairy', '100 g', 100, 265, 1800, 300, 2000, 0),
  (NULL, 'Cheese slice', 'dairy', '1 slice', 20, 70, 400, 100, 550, 0),
  (NULL, 'Ghee', 'dairy', '1 tsp', 5, 45, 0, 0, 500, 0),
  (NULL, 'Butter', 'dairy', '1 tsp', 5, 36, 0, 0, 400, 0),
  (NULL, 'Cooking oil', 'dairy', '1 tsp', 5, 40, 0, 0, 450, 0),
  (NULL, 'Banana', 'fruit', '1 medium', 120, 105, 130, 2700, 40, 310),
  (NULL, 'Apple', 'fruit', '1 medium', 180, 95, 50, 2500, 30, 440),
  (NULL, 'Orange', 'fruit', '1 medium', 130, 62, 120, 1500, 20, 310),
  (NULL, 'Mango', 'fruit', '1 medium', 200, 200, 280, 5000, 130, 540),
  (NULL, 'Papaya', 'fruit', '1 katori', 150, 55, 90, 1400, 20, 250),
  (NULL, 'Watermelon', 'fruit', '1 katori', 150, 46, 90, 1150, 20, 60),
  (NULL, 'Grapes', 'fruit', '1 katori', 100, 62, 60, 1600, 40, 90),
  (NULL, 'Pomegranate', 'fruit', '1 katori', 100, 83, 170, 1900, 120, 400),
  (NULL, 'Guava', 'fruit', '1 medium', 100, 68, 260, 1400, 100, 540),
  (NULL, 'Chikoo', 'fruit', '1 medium', 100, 83, 40, 2000, 110, 530),
  (NULL, 'Pineapple', 'fruit', '1 katori', 150, 82, 90, 2200, 20, 230),
  (NULL, 'Dates', 'fruit', '4 dates', 30, 90, 80, 2400, 10, 210),
  (NULL, 'Almonds', 'nuts', '10 almonds', 12, 70, 260, 240, 600, 150),
  (NULL, 'Cashews', 'nuts', '10 cashews', 15, 90, 300, 500, 700, 50),
  (NULL, 'Walnuts', 'nuts', '4 halves', 12, 80, 180, 170, 800, 80),
  (NULL, 'Peanuts', 'nuts', '1 handful', 30, 170, 750, 500, 1400, 250),
  (NULL, 'Pistachios', 'nuts', '15 pieces', 15, 90, 320, 430, 720, 160),
  (NULL, 'Chia seeds', 'nuts', '1 tbsp', 12, 60, 200, 500, 380, 410),
  (NULL, 'Flax seeds', 'nuts', '1 tbsp', 10, 55, 190, 300, 430, 280),
  (NULL, 'Oats porridge', 'staple', '1 katori', 200, 150, 500, 2700, 300, 400),
  (NULL, 'Cornflakes with milk', 'staple', '1 katori', 200, 200, 700, 3500, 350, 150),
  (NULL, 'Muesli with milk', 'staple', '1 katori', 200, 250, 800, 4000, 600, 450),
  (NULL, 'Peanut butter', 'staple', '1 tbsp', 16, 95, 350, 350, 800, 100),
  (NULL, 'Jam', 'staple', '1 tbsp', 20, 55, 10, 1400, 0, 20),
  (NULL, 'Boiled sweet potato', 'staple', '1 medium', 130, 115, 200, 2700, 10, 400),
  (NULL, 'Boiled potato', 'staple', '1 medium', 150, 130, 300, 3000, 20, 250),
  (NULL, 'Quinoa cooked', 'staple', '1 katori', 150, 180, 650, 3200, 300, 400);
