var os = require('os');

var Kinect2 = require('kinect2');
var kinect = new Kinect2();

//  Create local peer server
var PeerServer = require('peer').PeerServer;
var server = PeerServer({port: 9001, path: '/'});

// Set peer credentials for localhost by default
var peerNet = {host: 'localhost', port: 9001, path: '/'};
var myPeerId = 'kinectron';
var peer_ids = [];
var peer_connections = [];
var peer = null;
var peerIdDisplay = null;
var newPeerEntry = false;
var newPeerInfo;

var canvas = null;
var context = null;
var canvasState = null;

var COLORWIDTH = 1920;
var COLORHEIGHT = 1080;

var DEPTHWIDTH = 512;
var DEPTHHEIGHT = 424;

var RAWWIDTH = 512;
var RAWHEIGHT = 424;

var imageData = null;
var imageDataSize = null;
var imageDataArray = null;

var busy = false;
var currentCamera = null;

var sendAllBodies = false;

var multiFrame = false;
var currentFrames = null;
var sentTime = Date.now();

var rawDepth = false;
var blockAPI = false;

// Key Tracking needs cleanup
var trackedBodyIndex = -1;

// Record variables
const recordingLocation = os.homedir() + "/kinectron-recordings/";
var doRecord = false;
var recordStartTime = 0;
var bodyChunks = [];
var mediaRecorders = [];

function getElements (selector, context) {
  var context = typeof context !== 'undefined' ?  context : document;
  var nodeList = context.querySelectorAll(selector);
  return nodeList ? Array.prototype.slice.call(nodeList, 0) : [];
}

window.addEventListener('load', initpeer);
window.addEventListener('load', init);


function init() {
  canvas = document.getElementById('inputCanvas');
  context = canvas.getContext('2d');

  startSkeletonTracking();
}

function toggleAPIBlocker(evt) {
  var apiButton = document.getElementById('api-blocker');
  var apiText = document.getElementById('api-blocker-intro');

  if (!blockAPI) {
    apiButton.value = "Allow API Calls";
    apiText.innerHTML = "API Calls Are Blocked";
  } else {
    apiButton.value = "Block API Calls";
    apiText.innerHTML = "API Calls Are Allowed";
  }

  blockAPI = !blockAPI;
}

// Only used for server-side record
function toggleRecord(evt) {
  if (!doRecord) {
    doRecord = true;
  } else {
    doRecord = false;
  }
  record(evt);
}

// Only used for client-iniated record
function startRecord() {
  // if record already running, do nothing
  if (doRecord) return;

  // if not, set do record and run
  if (!doRecord) {
    doRecord = true;
    record();
  }
}

function stopRecord() {
  // if record already stopped, do nothing
  if (!doRecord) return;
  // if running, turn record off
  if (doRecord) {
    doRecord = false;
    record();
  }
}

// Toggle Recording
function record(evt) {
  var recordButton = document.getElementById('record');
  var serverSide = false;

  if (evt) {
    evt.preventDefault();
    serverSide = true;
  }

  console.log(serverSide);

  if (doRecord) {
    // If no frame selected, send alert
    if (multiFrame === false && currentCamera === null) {
      alert("Begin broadcast, then begin recording");
      return;
    }

    var framesToRecord = [];

    if (multiFrame) {
      for (var i = 0; i < currentFrames.length; i++) {
        if (currentFrames[i] == 'body') framesToRecord.push('skeleton');
        else framesToRecord.push(currentFrames[i]);
      }
    } else if (currentCamera == 'body') {
      framesToRecord.push('skeleton');
    } else {
      framesToRecord.push(currentCamera);
    }

    for (var j = 0; j < framesToRecord.length; j++) {
      mediaRecorders.push(createMediaRecorder(framesToRecord[j], serverSide));
    }

    recordStartTime = Date.now();
    //doRecord = true;

    // Toggle record button color and text
    toggleButtonState('record', 'active');
    recordButton.value = "Stop Record";
  }

  else {
    //doRecord = false;
    toggleButtonState('record', 'inactive');
    recordButton.value = "Start Record";

    // Stop media recorders
    for (var k = mediaRecorders.length - 1; k >= 0; k--) {
      mediaRecorders[k].stop();
      mediaRecorders.splice(k, 1);
    }
  }
}

function createMediaRecorder(id, serverSide) {
  var idToRecord = id + "-canvas";
  var newMediaRecorder = new MediaRecorder(document.getElementById(idToRecord).captureStream());
  var mediaChunks = [];

  newMediaRecorder.onstop = function (e) {

    // The video as a blob
    var blob = new Blob(mediaChunks, { 'type' : 'video/webm' });

    // Reset Chunks
    mediaChunks.length = 0;

    // Display the video on the page
    // var videoElement = document.createElement('video');
    // videoElement.setAttribute("id", Date.now());
    // videoElement.controls = true;
    // document.body.appendChild(videoElement);
    // videoElement.src = window.URL.createObjectURL(blob);


    var fs = require('fs');
    try {
        fs.mkdirSync(recordingLocation);
    } catch (evt) {
        if (evt.code != 'EEXIST') throw e;
    }

    // If skeleton data is being tracked, write out the body frames JSON
    if (id == "skeleton") {
      var bodyJSON = JSON.stringify(bodyChunks);
      var filename = recordingLocation + "skeleton" + recordStartTime + ".json";
      fs.writeFile(filename, bodyJSON, "utf8", function() {
        if (serverSide === true) alert("Your file has been saved to " + filename);
      });
      bodyChunks.length = 0;
    }

    // Read the blob as a file
    var reader = new FileReader();
    reader.addEventListener('loadend', function(e) {
      // Create the videoBuffer and write to file
      var videoBuffer = new Buffer(reader.result);

      // Write it out
      var filename = recordingLocation + id + recordStartTime + ".webm";
      fs.writeFile(filename, videoBuffer,  function(err){
        if (err) console.log(err);
        if (serverSide === true) alert("Your file has been saved to " + filename);
      });
    }, false);
    reader.readAsArrayBuffer(blob);

  };

      // When video data is available
  newMediaRecorder.ondataavailable = function(e) {
    mediaChunks.push(e.data);
  };

  // Start recording
  newMediaRecorder.start();
  return newMediaRecorder;
}


function toggleFrameType(evt) {
  evt.preventDefault();
  var button = evt.srcElement;
  var state = button.id;

  if (state == "single-frame-btn") {
    button.style.background = "#1daad8";
    document.getElementById('multi-frame-btn').style.background = "#fff";

    document.getElementById('single-frame').style.display = 'block';
    document.getElementById('multi-frame').style.display = 'none';

  } else if (state == "multi-frame-btn") {
    button.style.background = "#1daad8";
    document.getElementById('single-frame-btn').style.background = "#fff";

    document.getElementById('single-frame').style.display = 'none';
    document.getElementById('multi-frame').style.display = 'block';

  }
}

function toggleAdvancedOptions(evt) {
  evt.preventDefault();

  var advOptions = document.getElementById('advanced-options');
  advOptions.style.display = advOptions.style.display == "block" ? "none" : "block";

  var advLink = document.getElementById('advanced-link');
  var hide = "<a id=\"advanced-link\" href=\"#\">Hide Advanced Options</a>";
  var show = "<a id=\"advanced-link\" href=\"#\">Show Advanced Options</a>";
  advLink.innerHTML = advLink.innerHTML == hide ? show : hide;
}

function getIpAddress() {
  var ifaces = os.networkInterfaces();
  var ipAddresses = [];

  Object.keys(ifaces).forEach(function (ifname) {
    var alias = 0;

    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return;
      }

      if (alias >= 1) {
        // this single interface has multiple ipv4 addresses
        ipAddresses.push(iface.address);

      } else {
        // this interface has only one ipv4 adress
        ipAddresses.push(iface.address);
      }
      ++alias;
    });
  });

  return ipAddresses;
}


function initpeer() {
    peer = new Peer(myPeerId, peerNet);
    peer.on('error',function(err) {
      console.log(err);
    });

    peer.on('open', function(id) {
      myPeerId = id;
  });

  peer.on('connection', function(conn) {
    connection = conn;
    console.log("Got a new data connection from peer: " + connection.peer);
    peer_connections.push(connection);

    connection.on('open', function() {
      console.log("Connection opened.");
      sendToPeer('ready', {});
    });

    connection.on('data', function(dataReceived) {
      if (blockAPI == true) return;

      switch (dataReceived.event) {
        case 'initfeed':
          if (dataReceived.data.feed) {
            chooseCamera(null, dataReceived.data.feed);
          }
        break;

        case 'feed':
          chooseCamera(null, dataReceived.data.feed);
        break;

        case 'multi':
          chooseMulti(null, dataReceived.data);
        break;

        case 'record':
          if (dataReceived.data == 'start') startRecord();
          if (dataReceived.data == 'stop') stopRecord();
        break;
      }

    });

  });

  peer.on('close', function() {
    console.log('Peer connection closed');

    // Only create new peer if old peer destroyed and new peer requested
    if (newPeerEntry) {
      peer = null;
      initpeer();
      newPeerEntry = false;
    }
  });
}


function newPeerServer(evt) {
  console.log('Creating new peer server');
  newPeerEntry = true;
  evt.preventDefault();
  myPeerId = document.getElementById('newpeerid').value;
  var peerNetTemp = document.getElementById('peernet').value;
  peerNet = JSON.parse(peerNetTemp);

  // Distroy default peer before creating new one
  peer.disconnect();
  peer.destroy();

  // Show new peer credentials. Hide default ip address
  document.getElementById("connectionopen").style.display = 'none';
  document.getElementById("newpeercreated").style.display = 'block';
}

function sendToPeer(evt, data) {
  var dataToSend = {"event": evt, "data": data};
  peer_connections.forEach(function(connection) {
    connection.send(dataToSend);
  });
}

////////////////////////////////////////////////////////////////////////
//////////////////////////// Set Canvas Dimensions ////////////////////

function updateDimFields(evt) {
  var element = evt.srcElement;
  var elementId = element.id;
  var size = element.value;
  var targetElement = null;

  evt.preventDefault();

  switch (elementId) {
    case 'colorwidth':
      targetElement = document.getElementById('colorheight');
      targetElement.value = (1080 * size) / 1920;
    break;

    case 'colorheight':
      targetElement = document.getElementById('colorwidth');
      targetElement.value = (1920 * size) / 1080;
    break;

    case 'depthwidth':
      targetElement = document.getElementById('depthheight');
      targetElement.value = (424 * size) / 512;
    break;

    case 'depthheight':
      targetElement = document.getElementById('depthwidth');
      targetElement.value = (512 * size) / 424;
    break;
  }
}

function setOutputDimensions(evt) {
  evt.preventDefault();

  var allCanvases = ['color', 'depth', 'raw-depth', 'skeleton', 'infrared', 'le-infrared', 'key'];

  var element = evt.srcElement;
  var elementId = element.id;

  for (var i = 0; i < allCanvases.length; i++) {
    var currentCanvas = document.getElementById(allCanvases[i] + '-canvas');
    var currentCanvasResolution = (currentCanvas.width / currentCanvas.height).toFixed(1);

    switch (elementId) {
      case 'colorsubmit':
        if (currentCanvasResolution == 1.8) {
          currentCanvas.width = document.getElementById('colorwidth').value;
          currentCanvas.height = document.getElementById('colorheight').value;
        }
      break;

      case 'depthsubmit':
        if (currentCanvasResolution == 1.2) {
          currentCanvas.width = document.getElementById('depthwidth').value;
          currentCanvas.height = document.getElementById('depthheight').value;
        }
      break;
    }
  }
}

////////////////////////////////////////////////////////////////////////
//////////////////////////// Feed Choice //////////////////////////////

function chooseCamera(evt, feed) {
  var camera;

  if (evt) {
    evt.preventDefault();
    camera = evt.srcElement.id;
  } else {
    camera = feed;
  }

  // Turn off multiframe if it is running
  if (multiFrame) {
    stopMulti();
  }

  if (currentCamera == camera) {
    return;
  } else if (camera == 'stop-all') {
    if (currentCamera) {
      changeCameraState(currentCamera, 'stop');
      toggleButtonState(currentCamera, 'inactive');
      toggleFeedDiv(currentCamera, "none");

      currentCamera = null;
      return;
    } else {
      return;
    }
  } else {
    if (currentCamera) {
      changeCameraState(currentCamera, 'stop');
      toggleButtonState(currentCamera, 'inactive');
      toggleFeedDiv(currentCamera, "none");

    }
    changeCameraState(camera, 'start');
    toggleButtonState(camera, 'active');
    toggleFeedDiv(camera, "block");

    currentCamera = camera;
  }
}

function toggleButtonState(buttonId, state) {
  var button = document.getElementById(buttonId);

  if (state == "active") {
    button.style.background = "#1daad8";
  } else if (state == "inactive") {
    button.style.background = "#fff";
  }
}

function toggleFeedDiv(camera, state) {
  var divsToShow = [];
  if (camera == 'multi') {
    for (var i = 0; i < currentFrames.length; i++) {
      if (currentFrames[i] == 'body') divsToShow.push('skeleton');
      else divsToShow.push(currentFrames[i]);
    }
  } else if (camera == 'body') {
    divsToShow.push('skeleton');
  } else {
    divsToShow.push(camera);
  }

  for (var j = 0; j < divsToShow.length; j ++) {
    var divId = divsToShow[j] + "-div";
    var feedDiv = document.getElementById(divId);

    feedDiv.style.display = state;
  }
}

function changeCameraState(camera, state) {
  var cameraCode;
  var changeStateFunction;

  switch (camera) {
    case 'color':
      cameraCode = 'Color';
    break;

    case 'depth':
      cameraCode = 'Depth';
    break;

    case 'raw-depth':
      cameraCode = 'RawDepth';
    break;

    case 'key':
      cameraCode = 'Key';
    break;

    case 'infrared':
      cameraCode = 'Infrared';
    break;

    case 'le-infrared':
      cameraCode = 'LEInfrared';
    break;

    case 'fh-joint':
      cameraCode = 'FHJoint';
    break;

    // case 'scale':
    //   cameraCode = 'ScaleUser';
    // break;

    case 'body':
      sendAllBodies = true;
      cameraCode = 'SkeletonTracking';
    break;

    case 'skeleton':
      sendAllBodies = false;
      cameraCode = 'SkeletonTracking';
    break;

    case 'multi':
      cameraCode = 'Multi';
    break;
  }

  changeStateFunction = window[state + cameraCode];
  changeStateFunction();
}

function chooseMulti(evt, incomingFrames) {
  if (evt) {
    evt.preventDefault();
  }

  // if single feed running, stop the feed
  if (currentCamera) {
    chooseCamera(null, 'stop-all');
  }

  var temp;
  var frames = [];
  var multiFrames =[];
  var result;

  if (incomingFrames) {
    frames = incomingFrames;
  } else {
    //find which feeds are checked
    var allCheckBoxes = document.getElementsByClassName('cb-multi');
    for(var i=0; i < allCheckBoxes.length; i++){
      if(allCheckBoxes[i].checked){
        frames.push(allCheckBoxes[i].value);
      }
    }
  }

  // if no frames selected, return
  if (frames.length === 0) {
    alert("Select at least one frame.");
    return;
  }

  // Set global frames variable for use in preview message
  currentFrames = frames;

  // TO DO Simplify the case and result per Shawn
  for (var j = 0; j < frames.length; j++) {
    var frameName;
    var tempName;

    frameName = frames[j];

    switch (frameName) {
      case 'color':
        multiFrames.push(Kinect2.FrameType.color);
      break;

      case 'depth':
         multiFrames.push(Kinect2.FrameType.depth);
      break;

      case 'body':
        multiFrames.push(Kinect2.FrameType.body);
      break;

      case 'raw-depth':
        multiFrames.push(Kinect2.FrameType.rawDepth);
      break;

      // case 'bodyIndexColor':
      //   multiFrames.push(Kinect2.FrameType.bodyIndexColor);
      // break;

      // case 'depthColor':
      //   multiFrames.push(Kinect2.FrameType.depthColor);
      // break;

      //infrared is not implemented for multiframe yet
      // case 'infrared':
      //    multiFrames.push(Kinect2.FrameType.infrared);
      // break;

      // case 'le-infrared':
      //   multiFrames.push(Kinect2.FrameType.longExposureInfrared);
      // break;
    }
  }

  result = multiFrames.reduce(function (a, b) { return a | b; });
  toggleFeedDiv('multi', 'block');
  startMulti(result);
}


////////////////////////////////////////////////////////////////////////
//////////////////////////// Kinect2 Frames ////////////////////////////

function startColor() {
  console.log('starting color camera');

  var colorCanvas = document.getElementById('color-canvas');
  var colorContext = colorCanvas.getContext('2d');

  resetCanvas('color');
  canvasState = 'color';
  setImageData();

  if(kinect.open()) {
    kinect.on('colorFrame', function(newPixelData){

      if(busy) {
        return;
      }
      busy = true;

      processColorBuffer(newPixelData);

      drawImageToCanvas(colorCanvas, colorContext, 'color', 'jpeg');
      busy = false;

    });
  }
  kinect.openColorReader();

}

function stopColor() {
  console.log('stopping color camera');
  kinect.closeColorReader();
  kinect.removeAllListeners();
  canvasState = null;
  busy = false;
}

function startDepth() {
  console.log("start depth camera");

  var depthCanvas = document.getElementById('depth-canvas');
  var depthContext = depthCanvas.getContext('2d');

  resetCanvas('depth');
  canvasState = 'depth';
  setImageData();

  if(kinect.open()) {
    kinect.on('depthFrame', function(newPixelData){
      if(busy) {
        return;
      }
      busy = true;

      processDepthBuffer(newPixelData);
      drawImageToCanvas(depthCanvas, depthContext, 'depth', 'jpeg');
      busy = false;
    });
  }
  kinect.openDepthReader();
}

function stopDepth() {
  console.log('stopping depth camera');
  kinect.closeDepthReader();
  kinect.removeAllListeners();
  canvasState = null;
  busy = false;
}

function startRawDepth() {
  console.log("start Raw Depth Camera");

  var rawDepthCanvas = document.getElementById('raw-depth-canvas');
  var rawDepthContext = rawDepthCanvas.getContext('2d');

  resetCanvas('raw');
  canvasState = 'raw';
  setImageData();

  rawDepth = true;
  if(kinect.open()) {
    kinect.on('rawDepthFrame', function(newPixelData){
      if(busy) {
        return;
      }
      busy = true;

      processRawDepthBuffer(newPixelData);
      var rawDepthImg = drawImageToCanvas(rawDepthCanvas, rawDepthContext, 'rawDepth', 'webp', 1);

      // limit raw depth to 25 fps
      if (Date.now() > sentTime + 40) {
        sendToPeer('rawDepth', rawDepthImg);
      sentTime = Date.now();
      }

      busy = false;
    });
  }
  kinect.openRawDepthReader();
}

function stopRawDepth() {
  console.log("stopping raw depth camera");
  kinect.closeRawDepthReader();
  kinect.removeAllListeners();
  canvasState = null;
  rawDepth = false;
  busy = false;
}

function startInfrared() {
  console.log('starting infrared camera');

  var infraredCanvas = document.getElementById('infrared-canvas');
  var infraredContext = infraredCanvas.getContext('2d');

  resetCanvas('depth');
  canvasState = 'depth';
  setImageData();

  if(kinect.open()) {
    kinect.on('infraredFrame', function(newPixelData){

      if(busy) {
        return;
      }
      busy = true;

      processDepthBuffer(newPixelData);
      drawImageToCanvas(infraredCanvas, infraredContext, 'infrared', 'jpeg');

      busy = false;
    });
  }
  kinect.openInfraredReader();

}

function stopInfrared() {
  console.log('stopping infrared camera');
  kinect.closeInfraredReader();
  kinect.removeAllListeners();
  canvasState = null;
  busy = false;
}

function startLEInfrared() {
  console.log('starting le-infrared');

  var leInfraredCanvas = document.getElementById('le-infrared-canvas');
  var leInfraredContext = leInfraredCanvas.getContext('2d');

  resetCanvas('depth');
  canvasState = 'depth';
  setImageData();


  if(kinect.open()) {
    kinect.on('longExposureInfraredFrame', function(newPixelData){
      if(busy) {
        return;
      }
      busy = true;

      processDepthBuffer(newPixelData);
      drawImageToCanvas(leInfraredCanvas, leInfraredContext, 'LEinfrared', 'jpeg');

      busy = false;
    });

  }

  kinect.openLongExposureInfraredReader();
}

function stopLEInfrared() {
  console.log('stopping le-infrared');
  kinect.closeLongExposureInfraredReader();
  kinect.removeAllListeners();
  canvasState = null;
  busy = false;
}

// Variables
var balls = [];
var gravityPos = [];
var explosionDistance = 2;
var shouldExplode = false;
var bgColor = '#000000';

var skeletonCanvas;
var skeletonContext;
var gravityCanvas;
var gravityContext;
var paintCanvas;
var paintContext;
var dataEl;
var buttonsEl;
var animationId = 0;
var bodys = [];
var changeAnimationId;

function startSkeletonTracking() {
  console.log('starting skeleton');

  var animationCanvas = getElements('.animation_canvas')

  skeletonCanvas = document.getElementById('canvas_0');
  skeletonContext = skeletonCanvas.getContext('2d');

  gravityCanvas = document.getElementById('canvas_1');
  gravityContext = gravityCanvas.getContext('2d');

  paintCanvas = document.getElementById('canvas_2');
  paintContext = paintCanvas.getContext('2d');

  dataEl = document.getElementById('data');

  // change animation
  changeAnimationId = function (nextId) {
    animationCanvas[animationId].style.zIndex = 0;
    animationId = nextId;
    clearCanvas();
    animationCanvas[animationId].style.zIndex = 1;
  };

  buttonsEl = document.getElementById('buttons');
  getElements('button', buttonsEl).forEach(function (el) {
    el.addEventListener('click', function (e) {
      changeAnimationId(Number(e.target.value));
    });
  })
  animationCanvas[animationId].style.zIndex = 1;

  resetCanvas('depth');
  canvasState = 'depth';

  // Variables
  var ballCount = 750;
  var friction = .965;
  var jointCount = 25;

  var colors = [
    '#81C3D7',
    '#D9DCD6',
    '#3A7CA5',
    '#2F6690'
  ];

  // Utility Functions
  function randomIntFromRange(min,max) {
  	return Math.floor(Math.random() * (max - min + 1) + min);
  }

  function randomeFloatFromRange(min, max){
    return Math.random() * (max - min) + min;
  }

  function randomColor(colors) {
  	return colors[Math.floor(Math.random() * colors.length)];
  }

  // Objects
  function Ball(px, py, vx, vy, f, radius, color, index) {
  	this.p = [px, py];
    this.v = [vx, vy];
    this.gv = [0, 0];
    this.gp = 0;
  	this.radius = radius;
  	this.color = color;
    this.f = f;
    this.index = index % jointCount;

  	this.update = function() {
      // calculate gravity vector
      var pos = gravityPos[this.index]
      this.gv = [pos[0] - this.p[0], pos[1] - this.p[1]];

      // Calculate gravity intensity
      var a = pos[0] - this.p[0];
      var b = pos[1] - this.p[1];
      this.gp = 1 / (Math.sqrt( a*a + b*b ));

      // Explode if needed
      if (shouldExplode){
        this.v[0] *= randomeFloatFromRange(-5, 5);
        this.v[1] *= randomeFloatFromRange(-5, 5);
      }

      // Reduce ball's own velocity with friction
      this.v[0] *= this.f;
      this.v[1] *= this.f;

      // Calculate new velocity, add gravity
      this.v[0] += this.gv[0] * this.gp * this.f;
      this.v[1] += this.gv[1] * this.gp * this.f;

      // Move
  		this.p[0] += this.v[0];
  		this.p[1] += this.v[1];
  		this.draw();
  	};

  	this.draw = function() {
      gravityContext.save();
  		gravityContext.beginPath();
  		gravityContext.arc(this.p[0], this.p[1], this.radius, 0, Math.PI * 2, false);
  		gravityContext.fillStyle = this.color;
  		gravityContext.fill();
  		gravityContext.closePath();
      gravityContext.restore();
  	};
  }

  // init
  for (var i = 0; i < 1; i++) {
    bodys[i] = {
      joints: []
    };
    for(var j = 0 ; j < jointCount ; j++){
      bodys[i].joints[j] = {
        x: skeletonCanvas.width / 2,
        y: skeletonCanvas.height / 2
      };
    }
  }
  for(var i = 0 ; i < jointCount ; i++){
    gravityPos.push([skeletonCanvas.width / 2, skeletonCanvas.height / 2]);
  }
  balls = [];
  for(var i = 0 ; i < ballCount ; i++){
    var rd = randomeFloatFromRange(1, 3);
    var px = randomeFloatFromRange(0, gravityCanvas.width / 15) + (gravityCanvas.width / 2);
    var py = randomeFloatFromRange(0, gravityCanvas.height / 15) + (gravityCanvas.height / 2);
    var vx = randomeFloatFromRange(-1, 1);
    var vy = randomeFloatFromRange(-1, 1);
    var f = friction;
    balls.push(new Ball(px, py, vx, vy, f, rd, randomColor(colors), i));
  }

  if(kinect.open()) {
    kinect.on('bodyFrame', function(bodyFrame){
      if(sendAllBodies) {
        sendToPeer('bodyFrame', bodyFrame);
        if (doRecord) {
          bodyFrame.record_startime = recordStartTime;
          bodyFrame.record_timestamp = Date.now() - recordStartTime;
          bodyChunks.push(bodyFrame);
        }
      }

      skeletonContext.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
      gravityContext.clearRect(0, 0, gravityCanvas.width, gravityCanvas.height);
      pointContext.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
      var index = 0;
      bodyFrame.bodies.forEach(function(body){
        if(body.tracked) {
          if (!sendAllBodies) {
            sendToPeer('trackedBodyFrame', body);
            if (doRecord) {
              body.record_startime = recordStartTime;
              body.record_timestamp = Date.now() - recordStartTime;
              bodyChunks.push(body);
            }
          }

          updateBody(body, index)
          index++;

        }
      });
    });
    kinect.openBodyReader();
    animate();

    // dummy
    // window.addEventListener('mousemove', function (e) {
    //   var joints = [];
    //   for(var i = 0 ; i < jointCount ; i++){
    //     joints.push({
    //       depthX: (1 - (e.clientX / window.innerWidth)),
    //       depthY: e.clientY / window.innerHeight
    //     });
    //   }
    //   //console.log(joints);
    //   updateBody({
    //     joints: joints
    //   }, 0);
    // });
  }

}

function stopSkeletonTracking() {
  console.log('stopping skeleton');
  kinect.closeBodyReader();
  kinect.removeAllListeners();
  canvasState = null;

}

function displayCurrentFrames() {
  var allFrameDisplay = document.getElementsByClassName('current-frames');

  for (var i = 0; i < allFrameDisplay.length; i++) {
    allFrameDisplay[i].innerHTML = currentFrames;
  }
}

function startKey() {
  console.log('starting key');

  var keyCanvas = document.getElementById('key-canvas');
  var keyContext = keyCanvas.getContext('2d');


  resetCanvas('color');
  canvasState = 'color';
  setImageData();

  if(kinect.open()) {
      kinect.on('multiSourceFrame', function(frame) {

        if(busy) {
          return;
        }
        busy = true;

        var closestBodyIndex = getClosestBodyIndex(frame.body.bodies);
        if(closestBodyIndex !== trackedBodyIndex) {
          if(closestBodyIndex > -1) {
            kinect.trackPixelsForBodyIndices([closestBodyIndex]);
          } else {
            kinect.trackPixelsForBodyIndices(false);
          }
        }
        else {
          if (closestBodyIndex > -1) {
            if (frame.bodyIndexColor.bodies[closestBodyIndex].buffer) {

              newPixelData = frame.bodyIndexColor.bodies[closestBodyIndex].buffer;

              for (var i = 0; i < imageDataSize; i++) {
                imageDataArray[i] = newPixelData[i];
              }

              drawImageToCanvas(keyCanvas, keyContext, 'key', 'webp');
            }
          }
        }
        trackedBodyIndex = closestBodyIndex;
        busy = false;

      }); // kinect.on
    } // open
      kinect.openMultiSourceReader({
        frameTypes: Kinect2.FrameType.bodyIndexColor | Kinect2.FrameType.body
      });
}

function stopKey() {
  console.log('stopping key');
  kinect.closeMultiSourceReader();
  kinect.removeAllListeners();
  canvasState = null;
  busy = false;
}

function loadFile(e) {
  window.location.href = e.target.files[0].path;
}

function setImageData() {
  imageData = context.createImageData(canvas.width, canvas.height);
  imageDataSize = imageData.data.length;
  imageDataArray = imageData.data;
}

function resetCanvas(size) {
  switch (size) {
    case 'depth':
      canvas.width = DEPTHWIDTH;
      canvas.height = DEPTHHEIGHT;
      //outputCanvas.width = outputDepthW;
      //outputCanvas.height = outputDepthH;
    break;

    case 'color':
      canvas.width = COLORWIDTH;
      canvas.height = COLORHEIGHT;
      //outputCanvas.width = outputColorW;
      //outputCanvas.height = outputColorH;
    break;

    case 'raw':
      canvas.width = RAWWIDTH;
      canvas.height = RAWHEIGHT;
      //outputCanvas.width = OUTPUTRAWW;
      //outputCanvas.height = OUTPUTRAWH;
    break;
  }
}

function drawImageToCanvas(inCanvas, inContext, frameType, imageType, quality) {
  var outputCanvasData;
  var imageQuality = 0.5;
  var dataToSend;

  if (typeof quality !=="undefined") imageQuality = quality;

  context.putImageData(imageData, 0, 0);
  inContext.clearRect(0, 0, inCanvas.width, inCanvas.height);
  inContext.drawImage(canvas, 0, 0, inCanvas.width, inCanvas.height);
  outputCanvasData = inCanvas.toDataURL("image/" + imageType, imageQuality);

  if (multiFrame) {
    return outputCanvasData;
  } else if (rawDepth) {
    return outputCanvasData;
  } else {
    packageData(frameType, outputCanvasData);
  }
}

function packageData(frameType, outputCanvasData) {
  dataToSend = {'name': frameType, 'imagedata': outputCanvasData};
  sendToPeer('frame', dataToSend);
}

function processColorBuffer(newPixelData) {
  for (var i = 0; i < imageDataSize; i++) {
    imageDataArray[i] = newPixelData[i];
  }
}

function processDepthBuffer(newPixelData){
  var j = 0;

  for (var i = 0; i < imageDataSize; i+=4) {
    imageDataArray[i] = newPixelData[j];
    imageDataArray[i+1] = newPixelData[j];
    imageDataArray[i+2] = newPixelData[j];
    imageDataArray[i+3] = 0xff; // set alpha channel at full opacity
    j++;
  }
}

function processRawDepthBuffer(newPixelData) {
  var j = 0;
  for (var i = 0; i < imageDataSize; i+=4) {
    imageDataArray[i] = newPixelData[j];
    imageDataArray[i+1] = newPixelData[j+1];
    imageDataArray[i+2] = 0;
    imageDataArray[i+3] = 0xff;
    j+=2;
  }
}

function getClosestBodyIndex(bodies) {
  var closestZ = Number.MAX_VALUE;
  var closestBodyIndex = -1;
  for(var i = 0; i < bodies.length; i++) {
    if(bodies[i].tracked && bodies[i].joints[Kinect2.JointType.spineMid].cameraZ < closestZ) {
      closestZ = bodies[i].joints[Kinect2.JointType.spineMid].cameraZ;
      closestBodyIndex = i;
    }
  }
  return closestBodyIndex;
}

// animate balls
var isOpenHandState = false;
function animate() {
	requestAnimationFrame(animate);

  var body = bodys[0];
  if (body.rightHandState === Kinect2.HandState.open && body.joints[Kinect2.JointType.handRight].y < 40) {
    if (!isOpenHandState) {
      changeAnimationId(animationId >= 2 ? 0 : animationId + 1);
      isOpenHandState = true;
    }
  } else {
    isOpenHandState = false;
  }

  switch (animationId) {
    case 0:
      clearCanvas();
      for(let i = 0, l = bodys.length; i < l; i++){
        drawSkeleton(bodys[i], i)
      }
      break;
    case 1:
      clearCanvas();
      for(let i = 0, l = bodys.length; i < l; i++){
        var body = bodys[i];
        for(var jointType in body.joints) {
          var joint = body.joints[jointType];
          gravityPos[jointType] = [joint.x, joint.y];
        }
      }
      // updateShouldExplode();
      for(let i = 0, l = balls.length; i < l; i++){
        balls[i].update();
      }
      break;
    case 2:
      for(let i = 0, l = bodys.length; i < l; i++){
        paintApp.update(bodys[i]);
      }
      break;
    // case 3:
    //   break;
  }
}

function clearCanvas(){
  if(bgColor){
    skeletonContext.save();
    skeletonContext.fillStyle = bgColor;
    skeletonContext.fillRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
    skeletonContext.restore();

    gravityContext.save();
    gravityContext.fillStyle = bgColor;
    gravityContext.fillRect(0, 0, gravityCanvas.width, gravityCanvas.height);
    gravityContext.restore();

    paintContext.save();
    paintContext.fillStyle = bgColor;
    paintContext.fillRect(0, 0, paintCanvas.width, paintCanvas.height);
    paintContext.restore();
  }else{
    skeletonContext.clearRect(0, 0, skeletonCanvas.width, skeletonCanvas.height);
    gravityContext.clearRect(0, 0, gravityCanvas.width, gravityCanvas.height);
    pointContext.clearRect(0, 0, paintCanvas.width, paintCanvas.height);
  }
}

function updateBody(body, index) {
  //draw joints
  for(var jointType in body.joints) {
    var joint = body.joints[jointType];
    var x = joint.depthX * skeletonCanvas.width;
    var y = joint.depthY * skeletonCanvas.height;
    dataEl.innerHTML = joint.depthX + ', ' + skeletonCanvas.width;
    bodys[index].joints[jointType] = {
      x: x,
      y: y
    };
  }
}

// Skeleton variables
var skeletonColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'];

function drawSkeleton(body, index) {
  //draw joints
  for(var jointType in body.joints) {
    var joint = body.joints[jointType];
    //console.log(joint);
    skeletonContext.fillStyle = skeletonColors[index];
    skeletonContext.fillRect(joint.x, joint.y, 10, 10);
  }

  //draw hand states
  updateHandState(skeletonContext, body.leftHandState, body.joints[Kinect2.JointType.handLeft]);
  updateHandState(skeletonContext, body.rightHandState, body.joints[Kinect2.JointType.handRight]);
}

function updateHandState(context, handState, jointPoint) {
  var HANDCLOSEDCOLOR = 'red';
  var HANDOPENCOLOR = 'green';
  var HANDLASSOCOLOR = 'blue';

  switch (handState) {
    case Kinect2.HandState.closed:
      drawHand(context, jointPoint, HANDCLOSEDCOLOR);
    break;

    case Kinect2.HandState.open:
      drawHand(context, jointPoint, HANDOPENCOLOR);
    break;

    case Kinect2.HandState.lasso:
      drawHand(context, jointPoint, HANDLASSOCOLOR);
    break;

    default:
  }
}

function drawHand(context, jointPoint, handColor) {
  var HANDSIZE = 30;
  // draw semi transparent hand cicles
  var handData = {depthX: jointPoint.depthX, depthY: jointPoint.depthY, handColor: handColor, handSize: HANDSIZE};
  //sendToPeer('drawHand', handData);
  context.globalAlpha = 0.75;
  context.beginPath();
  context.fillStyle = handColor;
  context.arc(jointPoint.depthX * 512, jointPoint.depthY * 424, HANDSIZE, 0, Math.PI * 2, true);
  context.fill();
  context.closePath();
  context.globalAlpha = 1;
}

function updateShouldExplode(){
  var x = 0;
  var y = 0;
  for(var i = 0 ; i < balls.length ; i++){
    x += balls[i].v[0] < 0 ? balls[i].v[0] * -1 : balls[i].v[0];
    y += balls[i].v[1] < 0 ? balls[i].v[1] * -1 : balls[i].v[1];
  }
  shouldExplode = x / balls.length < explosionDistance && y / balls.length < explosionDistance;
}

// Oil Painting
// Ported from flash project - http://wonderfl.net/c/92Ul
//
//
function OilPainting(){

	var startPos = {x: window.innerWidth/2, y: window.innerHeight/2};
	var prevPos = {x: window.innerWidth/2, y: window.innerHeight/2};
	var dist = {x: 0, y: 0};
	var colour = '#ffffff';


	this.update = function(body) {
    var rightHandJoint = body.joints[Kinect2.JointType.handRight];

		var distance = Math.sqrt(Math.pow(prevPos.x - startPos.x, 2) +
								 Math.pow(prevPos.y - startPos.y, 2));

		var a = distance * 1 * (Math.pow(Math.random(), 2) - 0.5);

		var r = Math.random() - 0.5;

		var size = (Math.random() * 5) / distance;

		dist.x = (prevPos.x - startPos.x) * Math.sin(0.5) + startPos.x;
		dist.y = (prevPos.y - startPos.y) * Math.cos(0.5) + startPos.y;

		startPos.x = prevPos.x;
		startPos.y = prevPos.y;

		prevPos.x = (rightHandJoint.x);
		prevPos.y = (rightHandJoint.y);

	   // ------- Draw -------
	   var lWidth = (Math.random()+20/10-0.5)*size+(1-Math.random()+30/20-0.5)*size;
	   paintContext.lineWidth = lWidth;
	   paintContext.strokeWidth = lWidth;

	   paintContext.lineCap = 'round';
	   paintContext.lineJoin = 'round';

	   paintContext.beginPath();
	   paintContext.moveTo(startPos.x, startPos.y);
	   paintContext.quadraticCurveTo(dist.x, dist.y, prevPos.x, prevPos.y);

	   paintContext.fillStyle = colour;
	   paintContext.strokeStyle = colour;

	   paintContext.moveTo(startPos.x + a, startPos.y + a);
	   paintContext.lineTo(startPos.x + r + a, startPos.y + r + a);

	   paintContext.stroke();
	   paintContext.fill();

	   paintContext.closePath();
	}

	var MouseDown = function(e) {
		e.preventDefault();
		colour = '#'+Math.floor(Math.random()*16777215).toString(16);
		paintContext.fillStyle = colour;
	    paintContext.strokeStyle = colour;
	}

	var MouseDbl = function(e) {
		e.preventDefault();
		paintContext.clearRect(0, 0, width, height);
	}

}

var paintApp = new OilPainting();
