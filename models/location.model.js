import mongoose from 'mongoose';

// Define the schema for storing GeoJSON location
const locationSchema = new mongoose.Schema({
  location: {
    type: {
      type: String,
      enum: ['Point'], // This tells MongoDB this is a GeoJSON Point
      required: true,
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true,
    },
  },
});

// Create a model for Location
const Location = mongoose.model('Location', locationSchema);

// Create the 2dsphere index for geospatial queries (required for geospatial searches)
locationSchema.index({ location: '2dsphere' });

export default Location;
