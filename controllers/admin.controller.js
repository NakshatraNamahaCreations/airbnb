import User from '../models/user.model.js';


const getAllUsers = async(req, res) => {
  console.log('inside getallusers ');
  // const { userId } = req;
  const users = await User.find().lean();
  console.log('users: ', users);


  res.status(200).json({
    message: 'All User fecthed successfully',
    data: users,
  });
};









const upgradeToHost = async(req, res) => {
  console.log('inside upgradeToHost  ');
  // const { id } = req;
  const { userId } = req.params;
  if (!id) { return res.status(400).json({ message: 'id nededed' }); }


  // these r sep objects
  // const user = await User.findById(id);

  // if (!user) { return res(404).json({ message: 'user doesnt exist' }) }
  // console.log('users: ', user);

  // await User.updateOne(
  //   { _id: id },
  //   { $addToSet: { roles: "host" } }
  // );


  const user = await User.findByIdAndUpdate(
    id,
    { $addToSet: { roles: 'host' } },
    { new: true }, // return updated doc
  );

  if (!user) {
    return res.status(404).json({ message: 'user doesnt exist' });
  }

  res.status(200).json({
    message: 'user became host successfully',
    data: user,
  });
};







export { getAllUsers, upgradeToHost };
