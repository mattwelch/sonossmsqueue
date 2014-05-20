/*
* sonossmsqueue.js
* add rdio songs to a sonos queue with sms
*
*/
'use strict'

var Rdio = require('node-rdio'),
	express = require('express'),
	app = express(),
	bodyParser = require("body-parser"),
	sqlite3 = require('sqlite3').verbose(),
	twilio = require('twilio'),
	db = new sqlite3.Database(''), // Set up our db as a transient file on disc
	SonosDiscovery = require('sonos-discovery'),
	discovery = new SonosDiscovery();

var player;

var uri='x-sonos-http:_t%3a%3a{trackId}%3a%3aal%3a%3a{albumId}%3a%3a18422.mp3?sid=11&flags=32'
var metadata='<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="10030020_t%3a%3a{trackId}%3a%3aal%3a%3a{albumId}%3a%3a18422" parentID="10030020_t%3a%3a{albumId}%3a%3aal%3a%3a1387221%3a%3a18422" restricted="true"><dc:title>{songName}</dc:title><upnp:class>object.item.audioItem.musicTrack</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON2823_'+process.env.RDIO_USER_NAME+'</desc></item></DIDL-Lite>';

// Wait until the Sonos discovery process is done, then grab our player
discovery.on('topology-change', function() {
    if (!player)
        player = discovery.getPlayer('family room');
});

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {exit:true}));

//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {exit:true}));

// Put the table in that will hold the three choices a user can respond with
db.run("CREATE TABLE smsChoices (origin TEXT PRIMARY KEY, firstChoice TEXT, secondChoice TEXT, thirdChoice TEXT)");

// create our new rdio object, which we will use to search tracks later
var rdio = new Rdio([process.env.RDIO_KEY,process.env.RDIO_SECRET]);
app.use(bodyParser());

// Respond to a POST on the root of our server (at port 3000, as defined below)
// change this if you don't want ot listen at the root
app.post('/',
// This is the webhook middleware which basically rejects a POST if it isn't verified to have come from twilio (verification is accomplished
// behind the scenes with a hash that is sent in the request headers). You may need to specify your host ('https://www.xx.com:port') if you're
// operating behind a firewall, or on a home server
	twilio.webhook(),
	function(req,response){
    	response.type('text/xml');
    	var twiml = new twilio.TwimlResponse();

// If this a 1, 2, or 3, assume that the user is responding to an earlier request for a choice of 2 or 3 search results
		if (req.body.Body=='1' || req.body.Body=='2' || req.body.Body=='3') {
// We grab the row, identified by the user's phone number, which we grab from the "From" field from twilio
			db.get("SELECT * FROM smsChoices where origin='"+req.body.From+"'", function(err, row) {
// If something went wrong, or there were no results, tell the user to basically start over
				if (err || !row) {
					twiml.message('You entered a number, but have not conducted a prior search from which to select results. Please perform a text search first.');
					response.send(twiml.toString());
				}
// Otherwise, queue up the result we get (as identified by the 1, 2, or 3 the user sent)
				else {
					queueAndRespond(req.body.Body=='1'?JSON.parse(row.firstChoice):req.body.Body=='2'?JSON.parse(row.secondChoice):row.thirdChoice != null?JSON.parse(row.thirdChoice):null,function(msg) {
						twiml.message(msg);
						response.send(twiml.toString());
					});
				}
			});
		}
// If this is NOT a 1,2,3 the user is performing a search
		else {
// Let's use our rdio object, and search on the contents of the SMS we just received
			rdio.call('search',{'query':req.body.Body,'types':'Track'},function(err,res) {
// If we got more than one result, let's give the user a list of the top three, and let her choose
				if (res.result.number_results > 1) {
					var msg='Your search yielded more than one result. Please respond with either ';
					var firstThree=[];
					var oneTwoThree=[];
// Here we build some of the text of our response, but more importantly, we save the top three result objects for later use
					for (i=0; i < res.result.number_results; i++) {
						firstThree.push(res.result.results[i]);
						oneTwoThree.push(""+(i+1));
						if (i==2) break;
					}
					oneTwoThree[oneTwoThree.length-1]='or '+oneTwoThree[oneTwoThree.length-1];
					msg+=oneTwoThree.join(oneTwoThree.length==2?" ":", ");
					msg += ' to select one of the choices below, or respond with a new search.\n\n';
// Let's go through our top three objects, and format them for the user to choose from
					for (var i=0; i < firstThree.length; i++) {
						msg+=(i+1)+': '+firstThree[i].name+'\nby '+firstThree[i].artist+'\non "'+firstThree[i].album+'"\n\n';
					}
// And get ready to send our choice message to the user, again through sms/twilio
				    twiml.message(msg);
// Also, we need to save string representation of our top three objecgs to the db, with the user's phone number as the primary id, so we can look it up later when the user
// gives us a choice
					db.run("INSERT OR REPLACE INTO smsChoices (origin, firstChoice, secondChoice, thirdChoice) VALUES (?,?,?,?)", [req.body.From,JSON.stringify(firstThree[0]),JSON.stringify(firstThree[1]),JSON.stringify(firstThree[2])]);
// Send off our response
				    response.send(twiml.toString());
				}
// No results? Sadface.
				else if (res.result.number_results == 0) {
				    twiml.message('Your search returned no results. Please try again with more general terms.');
				    response.send(twiml.toString());
				}
// We got exactly one result...
				else {
// So let's queue it up, and inform the user that we did so
					queueAndRespond(res.result.results[0],function(msg){
						twiml.message(msg);
						response.send(twiml.toString());
					});
				}
			});

		}
	}
);

// Fire our POST server up, listening on port 3000
var server=app.listen(3000,function() {
});


// Function that gets an rdio response object (which we saved, serialized, in the database, or which we just got in the case of a single match) and
// using our node-sonos-discovery package, insert the song onto the end of the queue
function queueAndRespond(p,callback) {
	var t;
	if (!p) {
		t='You selected an unavailable option.';
		callback(t);
		return;
	}
// Call the queueu insertion...
	player.addURIToQueue(uri.replace('{trackId}',p.key.replace(/\D/g,'')).replace('{albumId}',p.albumKey.replace(/\D/g,'')),metadata.replace('{songName}',p.name).replace('{trackId}',p.key.replace(/\D/g,'')).replace('{albumId}',p.albumKey.replace(/\D/g,'')),function(success) {
// And let the user know it worked by telling him the artist/title of the song
		if(success)
			t='Your song, "'+p.name+'" by '+p.artist+' has been added to the queue. Enjoy the party!';
// or tell him things failed
		else
			t='There was a problem adding your song to the queue. Please try again.';
		callback(t);
	});
}

function exitHandler(options, err) {
    db.close();
    if (options.exit) process.exit();
}
