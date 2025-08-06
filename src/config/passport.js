  const passport = require('passport');
  const GoogleStrategy = require('passport-google-oauth20').Strategy;
  const User = require('../models/User');

  // Google OAuth Strategy
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      console.log('🔐 Google OAuth Profile:', {
        id: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value,
        photo: profile.photos?.[0]?.value
      });

      // Check if user already exists with Google ID
      let existingUser = await User.findOne({ googleId: profile.id });

      if (existingUser) {
        console.log('✅ Found existing user with Google ID:',
  existingUser.email);
        return done(null, existingUser);
      }

      // Check if user exists with same email
      if (profile.emails?.[0]?.value) {
        existingUser = await User.findOne({ email: profile.emails[0].value
  });

        if (existingUser) {
          console.log('🔗 Linking Google account to existing user:',
  existingUser.email);
          // Link Google account to existing user
          existingUser.googleId = profile.id;
          existingUser.avatar = profile.photos?.[0]?.value ||
  existingUser.avatar;
          existingUser.authProvider = 'google';
          await existingUser.save();
          return done(null, existingUser);
        }
      }

      // Create new user
      console.log('👤 Creating new user from Google profile');
      const newUser = new User({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails?.[0]?.value || `${profile.id}@gmail.com`,
        avatar: profile.photos?.[0]?.value,
        type: 'consumer',
        emailVerified: true, // Google emails are already verified
        authProvider: 'google',
        // Generate a random password (won't be used for Google OAuth)
        password: 'google_oauth_user_' +
  Math.random().toString(36).substring(7)
      });

      const savedUser = await newUser.save();
      console.log('✅ Created new user:', savedUser.email);
      return done(null, savedUser);

    } catch (error) {
      console.error('❌ Google OAuth Strategy Error:', error);
      return done(error, null);
    }
  }));

  // Serialize/Deserialize user for sessions
  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });

  module.exports = passport;

