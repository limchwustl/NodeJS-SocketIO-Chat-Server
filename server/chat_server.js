// Require the functionality we need to use:
var http = require('http'),
	url = require('url'),
	path = require('path'),
	mime = require('mime'),
	path = require('path'),
	fs = require('fs');
//list of rooms and participants
const rooms = {}
//list of private rooms
const private_rooms = {}
//key-value pair of room and its password
const room_passwords = {}
//socketid : nickname k/v pair
const users = {}
let anonymousNumber = 0

// Make a simple fileserver for all of our static content.
// Everything underneath <STATIC DIRECTORY NAME> will be served.
var server = http.createServer(function(req, resp){
	var filename = path.join(__dirname, "../static", url.parse(req.url).pathname);
	
	(fs.exists || path.exists)(filename, function(exists){
		if (exists) {
			fs.readFile(filename, function(err, data){
				if (err) {
					// File exists butf is not readable (permissions issue?)
					resp.writeHead(500, {
						"Content-Type": "text/plain"
					});
					resp.write("Internal server error: could not read file");
					resp.end();
					return;
				}
				
				// File exists and is readable
				var mimetype = mime.getType(filename);
				resp.writeHead(200, {
					"Content-Type": mimetype
				});
				resp.write(data);
				resp.end();
				return;
			});
		}else{
			// File does not exist
			resp.writeHead(404, {
				"Content-Type": "text/plain"
			});
			resp.write("Requested file not found: "+filename);
			resp.end();
			return;
		}
	});
});
server.listen(3456);

// Import Socket.IO and pass our HTTP server object to it.
const socketio = require("socket.io")(http, {
    wsEngine: 'ws'
});

// Attach our Socket.IO server to our HTTP server to listen
const io = socketio.listen(server);
io.sockets.on("connection", async function (socket) {
	
	let current_room_name = null
	io.sockets.emit("send_rooms_to_client", {rooms: rooms})
    
	users[socket.id] = "anonymous" + anonymousNumber.toString()
	io.to(socket.id).emit("show_nickname_to_client", {nickname:"anonymous" + anonymousNumber.toString()})
	anonymousNumber += 1
	
	

	
    //listens to client to check if they passed down their nickname
     socket.on('nickname_to_server', function (data) {
		if(data.nickname === ""){
			io.to(socket.id).emit("send_error_message", 10)
			return
		}
		if (Object.values(users).includes(data.nickname)){
			io.to(socket.id).emit("send_error_message", 7)
			return
		}
        users[socket.id] = data.nickname
		io.to(socket.id).emit("show_nickname_to_client", {nickname:data.nickname})
		//checks if user is in a room and modifies the nickname in the room
		if (current_room_name !== null) {
			let user_list = rooms[current_room_name].users

			if (user_list && !user_list.includes(socket.id)) {
				user_list.push(socket.id)
	
				rooms[current_room_name].users = user_list
		
			let usernames = user_list.map(id => users[id])
			//io.to(current_room_name).emit("new_user_to_client", { users: usernames })
	
			//io.emit("new_user_to_client", { users: usernames })
			}
			
			rooms[current_room_name].users = user_list
		
			let usernames = user_list.map(id => users[id])
			//io.to(current_room_name).emit("new_user_to_client", { users: usernames })
	
			io.to(current_room_name).emit("new_user_to_client", { users: usernames })
			

	
		}
		
     });

	 
    socket.on('message_to_server', function (data) {
        // This callback runs when the server receives a new message from the client.
		let mess = users[socket.id] + ': ' + data["message"]
		
		let messArr = data['message'].split(" ")

		
		if (current_room_name) {

			if(rooms[current_room_name]){

				for (const word of messArr){
					for (const flagWord of rooms[current_room_name]['flagWords']){
						if(word === flagWord){
							io.to(socket.id).emit("send_error_message", 6)
							return
						}
					}
				}
			}

			io.to(current_room_name).emit("message_to_client", { message: mess })
		} else {
			console.log('Error! Not in room!')
		}


        
    });
	//send private message to the client
	socket.on("send_private_message", (data)=>{
		let sender = users[socket.id]
		let room = data['room']
		let userList = []
		let receiver = Object.keys(users).filter((key) => {return users[key] === data['user']})[0]
		//check if sender and receiver are both in a same room
		if(room in rooms){
			userList = rooms[room].users
			if (userList.includes(socket.id) && userList.includes(receiver)){
				io.to(receiver).emit("private_message_to_client",{sender: sender, receiver: data['user'], message: data['message'], is_sender: false})
				io.to(socket.id).emit("private_message_to_client",{sender: sender, receiver: data['user'], message: data['message'], is_sender: true})
				return
			}
		}
		
		
		io.to(socket.id).emit("send_error_message", 1)
		

	})

	socket.on("send_private_invitation", (data)=>{
		let sender = users[socket.id]
		let room = data['room']
		let userList = []
		let receiver = Object.keys(users).filter((key) => {return users[key] === data['user']})[0]
		if (receiver === null){
			io.to(socket.id).emit("send_error_message", 9)
			return
		}
		//check if the sender is in the room
		if(room in rooms){
			userList = rooms[room].users
			
			if (userList.includes(socket.id)){
				//onsole.log(receiver)
				
				io.to(receiver).emit("private_invitation_to_client",{sender: sender, room: room, receiver: data['user'], isPrivate: rooms[room].isPrivate, password: rooms[room].password})
				return
			}
		}
		
		
		io.to(socket.id).emit("send_error_message", 5)
		

	})
	socket.on('join_room_to_server_with_inv', function(data) {
		let name = data.name
		current_room_name = name
		
		if(!(name in rooms)){
			io.to(socket.id).emit("send_error_message", 8)
			return
		}
		let user_list = rooms[name]['users']

		let bans = rooms[name].bans
		if (bans.includes(socket.id)) {
			io.to(socket.id).emit("send_error_message", 2)
			return
		}
				//pushes user to the room on invite
				if (!user_list.includes(socket.id)) {
				user_list.push(socket.id)
				}
				socket.join(name);
				let usernames = user_list.map(id => users[id])
				io.to(current_room_name).emit("new_user_to_client", { users: usernames })
				io.to(socket.id).emit("show_joined_room_name_to_client", {room_name:current_room_name})
				let mess = "User " + users[socket.id] + " has joined the room!"

				io.to(name).emit("message_to_client", { message: mess })
				
				return

	})
    socket.on('join_room_to_server', function(data) {
		let name = data['name']
		let password = data['password']
		let isPrivate = data['isPrivate']
		let isNew = data['isNew']
		let flagWords = data['flagWords']
		console.log(data)
		current_room_name = name
		
		//check if the room is being created
		if (isNew){
			if(name in rooms){
				io.to(socket.id).emit("send_error_message", 4)
				return
			}
			//initialize rooms
			rooms[name] = {
				'isPrivate' : isPrivate,
				'password' : password,
				'users' : [socket.id],
				'owner': socket.id,
				"bans": [],
				"flagWords": flagWords,
			}
			//let user join the room
			
			socket.join(name);
			io.to(socket.id).emit("show_joined_room_name_to_client", {room_name:name})
			if(!isPrivate){
				io.emit("show_rooms_to_client", { roomname: name, isNew: isNew})
			}
			
			let usernames = rooms[name]['users'].map(id => users[id])
			io.to(current_room_name).emit("new_user_to_client", { users: usernames })
			
			return
		}
		//if not a new room
		if(!isNew){
			let bans = rooms[name].bans
			//if user is banned
			if (bans.includes(socket.id)) {
				io.to(socket.id).emit("send_error_message", 2)
				return
			}
			//not a valid room name
			if(!(name in rooms)){
				io.to(socket.id).emit("send_error_message", 8)
				return
			}
			//if room is private
			if(rooms[name]['isPrivate'] === true){
				if(rooms[name]['password'] === password){
					let user_list = rooms[name]['users']

					if (!user_list.includes(socket.id)) {
					user_list.push(socket.id)
					socket.join(name);
					let usernames = user_list.map(id => users[id])
					io.to(current_room_name).emit("new_user_to_client", { users: usernames })
					io.to(socket.id).emit("show_joined_room_name_to_client", {room_name:current_room_name})
					let mess = "User " + users[socket.id] + " has joined the room!"

					io.to(name).emit("message_to_client", { message: mess })
					}
					
					
					return

				}
				io.to(socket.id).emit("send_error_message", 0)
			}
			//public rooms
			if(!rooms[name]['isPrivate']){
				let user_list = rooms[name]['users']

				if (!user_list.includes(socket.id)) {
				user_list.push(socket.id)
				socket.join(name);
				let usernames = user_list.map(id => users[id])
				io.to(current_room_name).emit("new_user_to_client", { users: usernames })
				io.to(socket.id).emit("show_joined_room_name_to_client", {room_name:current_room_name})
				let mess = "User " + users[socket.id] + " has joined the room!"

				io.to(name).emit("message_to_client", { message: mess })
				}
				
				
				return
			}	
		}
    })
	//grants admin to the creater
	socket.on('user_admin_to_server', (data) => {
		let user_id = Object.keys(users).filter((key) => {return users[key] === data['user_name']})[0]
		let ban_user = data['ban_user']
		let room_name = data['room_name']

		if (rooms[room_name].owner !== socket.id) {
			io.to(socket.id).emit("send_error_message", 3)
		}
		if (ban_user) {
			rooms[room_name].bans.push(user_id)
		}
		let user_list = rooms[room_name].users
		const ind = user_list.indexOf(user_id)
		user_list.splice(ind,1)
		rooms[room_name].users = user_list

		let usernames = user_list.map(id => users[id])

		io.in(user_id).socketsLeave(room_name)
		io.to(current_room_name).emit("new_user_to_client", { users: usernames })
		io.to(user_id).emit("clear_room_to_client", {room: room_name})
	}) 
	//when user gets disconnected
	socket.on("disconnect", () => {
		if (current_room_name != null) {
			let user_list = rooms[current_room_name].users
			const ind = user_list.indexOf(socket.id)
			user_list.splice(ind,1)
			rooms[current_room_name].users = user_list
	
			let usernames = user_list.map(id => users[id])
	
			io.to(current_room_name).emit("new_user_to_client", { users: usernames })
		}

	})
})