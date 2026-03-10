import mongoose from "mongoose";

const providerServiceSchema = new mongoose.Schema(
{
provider: {
type: String,
required: true,
index: true,
trim: true,
},

providerServiceId: {
  type: Number,
  required: true,
  index: true,
},

name: {
  type: String,
  required: true,
  trim: true,
},

category: {
  type: String,
  required: true,
  trim: true,
  index: true,
},

rate: {
  type: Number,
  required: true,
  default: 0,
},

min: {
  type: Number,
  required: true,
},

max: {
  type: Number,
  required: true,
},

status: {
  type: Boolean,
  default: true,
  index: true,
},

},
{
timestamps: true,
versionKey: false, // removes __v (saves space)
}
);

/*
Prevent duplicate provider services
*/
providerServiceSchema.index(
{ provider: 1, providerServiceId: 1 },
{ unique: true }
);

const ProviderService = mongoose.model(
"ProviderService",
providerServiceSchema
);

export default ProviderService;
