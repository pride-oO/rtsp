module.exports = (sdp) => {
    const data = {};
    if (typeof sdp !== 'string' || !sdp.length){
        return data;
    }
    data['version'] = parseInt((sdp.match(/v=(.+)/) || [])[1] || '0');
    const o = ((sdp.match(/o=(.+)/) || [])[1] || '').split(' ');
    data['sessionID'] = o[1] || '';
    data['sessionName'] = o[0] || '';
    data['sessionVersion'] = o[2] || '';
    data['network'] = o[3] || '';
    data['addressType'] = o[4] || '';
    data['address'] = o[5] || '';
    data['sessionName'] = (sdp.match(/s=(.+)/) || [])[1] || '0';
    data['time'] = (sdp.match(/t=(.+)/) || [])[1] || '0 0';
    data['mediaType'] = [];
    const splitMedia = String(sdp).split("m=") || [];
    splitMedia.shift();
    if(splitMedia.length){
        for(let i in splitMedia){
            const splitText = String(splitMedia[i]);
            const split = String((splitText.match(/(.+)/) || [])[0] || '').split(" ");
            if(split.length >= 4){
                const type = String(split[0] || '');
                data['mediaType'].push(type);
                split.shift();
                data[type] = {};
                data[type]['type'] = type;
                data[type]['port'] = parseInt(split[0]) || 0;
                split.shift();
                data[type]['protocol'] = String(split[0] || '');
                split.shift();
                const interleaved = (splitText.match(new RegExp('a=interleaved=(.+)')) || [])[1] || '';
                if(interleaved.length){
                    data[type]['interleaved'] = interleaved;
                }
                const control = (splitText.match(new RegExp('a=control:(.+)')) || [])[1] || '';
                if(control.length){
                    data[type]['control'] = control;
                }
                const bitrate = (splitText.match(new RegExp('b=(.+)')) || [])[1] || '';
                if(bitrate.length){
                    data[type]['bitrate'] = bitrate;
                }
                data[type]['codec'] = [];
                for(let i in split){
                    data[type]['codec'].push({
                        "ID" : parseInt(split[i]) || 0,
                        "name" : (splitText.match(new RegExp('a=rtpmap:'+String(split[i])+' (.+)')) || [])[1] || '',
                        "fmtp" : (splitText.match(new RegExp('a=fmtp:'+String(split[i])+' (.+)')) || [])[1] || '',
                    });
                }

            }
        }
    }
    return data;
};