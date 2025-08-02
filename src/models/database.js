const { Sequelize, DataTypes } = require('sequelize');

// Initialize Sequelize with DATABASE_URL from Railway
const sequelize = process.env.DATABASE_URL 
  ? new Sequelize(process.env.DATABASE_URL, {
      dialect: 'postgres',
      protocol: 'postgres',
      dialectOptions: {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      },
      logging: false
    })
  : null;

// Define models only if sequelize is available
let User = null;
let ScanHistory = null;

if (sequelize) {
  // User model
  User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    plan: {
      type: DataTypes.ENUM('free', 'monthly', 'annual'),
      defaultValue: 'free'
    },
    subscriptionStatus: {
      type: DataTypes.ENUM('trial', 'active', 'cancelled', 'expired'),
      defaultValue: 'trial'
    },
    stripeCustomerId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    stripeSubscriptionId: {
      type: DataTypes.STRING,
      allowNull: true
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscriptionEndsAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  }, {
    timestamps: true,
    underscored: true
  });

  // ScanHistory model
  ScanHistory = sequelize.define('ScanHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: 'id'
      }
    },
    url: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    productName: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    authenticityScore: {
      type: DataTypes.INTEGER,
      validate: {
        min: 0,
        max: 100
      }
    },
    price: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    analysisData: {
      type: DataTypes.JSON,
      allowNull: true
    }
  }, {
    timestamps: true,
    underscored: true
  });
}

// Associations
if (sequelize && User && ScanHistory) {
  User.hasMany(ScanHistory, { foreignKey: 'userId' });
  ScanHistory.belongsTo(User, { foreignKey: 'userId' });
}

// Database sync function
const initDatabase = async () => {
  if (!sequelize) {
    console.log('📦 No database configured - using in-memory storage');
    return false;
  }

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
    
    // Sync models with database
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synced');
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
};

module.exports = {
  sequelize,
  User,
  ScanHistory,
  initDatabase
};