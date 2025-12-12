import Lib from './libraw.js';
const Module = await Lib();

      // Create wrapper functions for all the exported C functions
	  const api = {
        init: Module.cwrap('init', 'number',['number']),
        recycle: Module.cwrap('recycle', 'number'),
        open: Module.cwrap('open_buffer', 'number', ['number', 'number', 'number']),
		close: Module.cwrap('close', 'number'),
        version: Module.cwrap('version', 'number'),

        get_image: Module.cwrap('get_image', 'number', ['number','number']),
        clear_image: Module.cwrap('clear_image', '', ['number']),
        get_thumb: Module.cwrap('get_thumb', 'number', ['number']),
        clear_thumb: Module.cwrap('clear_image', '', ['number']),

		get_idata: Module.cwrap('get_idata', 'number'),
		get_sizes: Module.cwrap('get_sizes', 'number'),
		get_imgother: Module.cwrap('get_imgother', 'number'),

		set_param: Module.cwrap('set_param', '', ['number','number','number']),

      };
      const img_formats = {
        0: 'Unknown',
        1: 'JPEG',
        2: 'Bitmap',
        3: 'JPEGXL',
        4: 'H265',
      };
	  const thumb_formats = {
        0: 'Unknown',
        1: 'JPEG',
        2: 'Bitmap',
		3: 'Bitmap16',
		4: 'Layer',
		5: 'Rollei',
		6: 'H265',
		7: 'JPEGXL',
	  }

let librawPtr, bufPtr;
librawPtr = api.init();
self.postMessage({out: 'ready'});

self.onmessage = async (event) => {
	const {fn, args} = event.data;
	try {
		switch(fn) {
			case 'init': 
				{
					librawPtr = api.init();
					self.postMessage({out: 'ready'});
				}
			case 'open':
				{
					api.recycle(librawPtr);
					const [buffer] = args;
					if(bufPtr) Module._free(bufPtr);
					bufPtr = Module._malloc(buffer.byteLength);
					Module.HEAP8.set(new Uint8Array(buffer), bufPtr);
					const ret = api.open(librawPtr, bufPtr, buffer.byteLength);
					self.postMessage({out: ret});
					return;
				}
			case 'close': 
				{
					Module._free(bufPtr);
					bufPtr=false;
					const ret = api.close(librawPtr);
					self.postMessage({out: ret});
					return;
				}
			case 'set_params':
				{
					const [params] = args;
					Object.keys(params).forEach(param=>{
						const value = params[param];
						const buffer = Module._malloc(param.length+1);
						Module.stringToUTF8(param,buffer,param.length+1);
						api.set_param(librawPtr, buffer, value);
						Module._free(buffer);
					})
					self.postMessage({out: true});
					return;
				}
			case 'get_image':
				{
					const callbackPtr = Module.addFunction(function(count,msg) { 
						const msgStr = Module.UTF8ToString(msg);
						self.postMessage({out: {cb:true,count,msg:msgStr}});
					},'vii');
					const imagePtr = api.get_image(librawPtr,callbackPtr);
					const imageHeader = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, imagePtr, 16));
					//console.log(imageHeader)
					const imgView = new DataView((imageHeader.buffer));
					const image = {}
					image.format = imgView.getUint32(0,1)
					image.format_str = img_formats[image.format] || 'Unknown';
					image.size = imgView.getUint32(12,1) //unsigned
					let imgData = new Uint8Array(Module.HEAP8.buffer, imagePtr + 16, image.size);
					if(image.format===2){
						// Bitmap format RGB - need to convert to RGBA for display
						image.height = imgView.getUint16(4,1);
						image.width = imgView.getUint16(6,1); 
						image.colors = imgView.getUint8(8,1); //ushort
						image.bits = imgView.getUint8(10,1); //ushort
						//console.log('Converting bitmap',width,height,colors,bits,'>',image.size)
						let rgbaData = new Uint8ClampedArray(image.width * image.height * 4);
						for (let i = 0, j = 0; i < imgData.length; i += 3, j += 4) {
							rgbaData[j] = imgData[i];     // R
							rgbaData[j + 1] = imgData[i + 1]; // G
							rgbaData[j + 2] = imgData[i + 2]; // B
							rgbaData[j + 3] = 255;       // A
						}
						image.data=rgbaData
					}
					else {
						image.data=imgData;
					}
					self.postMessage({out: image});
					api.clear_image(imagePtr);
					return;
				}
			case 'get_thumb':
				{
					const thumbPtr = api.get_thumb(librawPtr);	
					const thumbHeader = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, thumbPtr, 16));
					const dataView = new DataView((thumbHeader.buffer));
					const thumb = {}
					thumb.format = dataView.getUint32(0,1)
					thumb.format_str = thumb_formats[thumb.format] || 'Unknown';
					thumb.size = dataView.getUint32(12,1)
					const thumbData = new Uint8Array(Module.HEAP8.buffer, thumbPtr + 16, thumb.size);
					thumb.data = thumbData;
					self.postMessage({out: thumb});
					api.clear_thumb(thumbPtr);
					return;
				}
			case 'get_metadata':
				{
					const metaPtr = api.get_idata(librawPtr)+4;
					const metaHeader = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, metaPtr, 64*8));
					const metadata={
						make: Module.UTF8ToString(metaPtr + 64*0),
						model: Module.UTF8ToString(metaPtr + 64*1),
						software: Module.UTF8ToString(metaPtr + 64*2),
						colors: new DataView(metaHeader.buffer).getInt32(64*5+16,1),
						cdesc: Module.UTF8ToString(metaPtr + 416),
						//col: Module.HEAP32.buffer[(metaPtr + 64*7)],
					};

					const sizePtr = api.get_sizes(librawPtr);
					const sizeHeader = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, sizePtr, 16*16));
					const sizes = {
						//raw_height: new DataView(sizeHeader.buffer).getUint16(0,1),
						//raw_width: new DataView(sizeHeader.buffer).getUint16(2,1),
						height: new DataView(sizeHeader.buffer).getUint16(4,1),
						width: new DataView(sizeHeader.buffer).getUint16(6,1),
						//top_margin: new DataView(sizeHeader.buffer).getUint16(8,1),
						//left_margin: new DataView(sizeHeader.buffer).getUint16(10,1),
						iheight: new DataView(sizeHeader.buffer).getUint16(12,1),
						iwidth: new DataView(sizeHeader.buffer).getUint16(14,1),
						//raw_pitch: new DataView(sizeHeader.buffer).getUint32(16,1),
						//pixel_aspect: new DataView(sizeHeader.buffer).getFloat64(20,1),
						flip: new DataView(sizeHeader.buffer).getInt8(28,1),
					};
					metadata.sizes = sizes;

					const imgotherPtr = api.get_imgother(librawPtr);
					const imgotherHeader = new Uint8Array(new Uint8Array(Module.HEAP8.buffer, imgotherPtr,  4*512));
					const imgother = {
						iso_speed: new DataView(imgotherHeader.buffer).getFloat32(0,1),
						shutter: new DataView(imgotherHeader.buffer).getFloat32(4,1),
						aperture: new DataView(imgotherHeader.buffer).getFloat32(8,1),
						focal_len: new DataView(imgotherHeader.buffer).getFloat32(12,1),
						timestamp: new DataView(imgotherHeader.buffer).getUint32(16,1),
						shot_order: new DataView(imgotherHeader.buffer).getUint16(20,1),
						//gpsdata: imgotherHeader.buffer.slice(24, 24+4*32),
					}
					const imgother_gps = {
						//gps: imgotherHeader.buffer.slice(24+128,24+128+288),
						lat_deg: new DataView(imgotherHeader.buffer).getFloat32(156+0,1),
						lat_min: new DataView(imgotherHeader.buffer).getFloat32(156+4,1),
						lat_sec: new DataView(imgotherHeader.buffer).getFloat32(156+8,1),
						long_deg: new DataView(imgotherHeader.buffer).getFloat32(156+12,1),
						long_min: new DataView(imgotherHeader.buffer).getFloat32(156+16,1),
						long_sec: new DataView(imgotherHeader.buffer).getFloat32(156+20,1),
						timestamp_deg: new DataView(imgotherHeader.buffer).getFloat32(156+24,1),
						timestamp_min: new DataView(imgotherHeader.buffer).getFloat32(156+28,1),
						timestamp_sec: new DataView(imgotherHeader.buffer).getFloat32(156+32,1),
						altitude: new DataView(imgotherHeader.buffer).getFloat32(156+36,1),
						//alt_ref: String.fromCharCode(imgotherHeader[156+40]),
						lat_ref: String.fromCharCode(imgotherHeader[156+41]),
						long_ref: String.fromCharCode(imgotherHeader[156+42]),
						//status: String.fromCharCode(imgotherHeader[156+43]),
						//parsed: String.fromCharCode(imgotherHeader[156+44]),
					};
					imgother.gps_info = imgother_gps;
					metadata.exif = imgother;


					self.postMessage({out: metadata});
					return;
				}
			case 'version':
				{
					const verPtr = api.version();
					const version = Module.UTF8ToString(verPtr);
					self.postMessage({out: version});
					return;
				}
			default:
				break;
		}
		self.postMessage({error: 'Unknown function: '+fn});
	} catch (err) {
		self.postMessage({error: err.message});
	}
};
