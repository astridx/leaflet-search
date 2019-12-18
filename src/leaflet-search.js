(function (factory) {
	if (typeof define === 'function' && define.amd) {
		//AMD
		define(['leaflet'], factory);
	} else if (typeof module !== 'undefined') {
		// Node/CommonJS
		module.exports = factory(require('leaflet'));
	} else {
		// Browser globals
		if (typeof window.L === 'undefined')
			throw 'Leaflet must be loaded first';
		factory(window.L);
	}
})(function (L) {

	L.Control.Search = L.Control.extend({

		includes: L.version[0] === '1' ? L.Evented.prototype : L.Mixin.Events,

		options: {
			placeholder_gemarkungsname: 'Gemarkungsname_',
			placeholder_fln: 'fln_',
			placeholder_fsn_zae: 'fsn_zae_',
			placeholder_fsn_nen: 'fsn_nen_	',
			url_list_gemarkungsnamen: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:gemarkungsname&propertyName=gemarkungsname&outputFormat=JSON', //
			url_list_fln: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fln&propertyName=fln&outputFormat=JSON', //
			url_list_fsn_zae: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fsn_zae&propertyName=fsn_zae&outputFormat=JSON', //
			url_list_fsn_nen: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fsn_nen&propertyName=fsn_nen&outputFormat=JSON', //
			jsonpParam: null, //jsonp param name for search by jsonp service, ex: "callback"
			propertyLoc: 'loc', //field for remapping location, using array: ['latname','lonname'] for select double fields(ex. ['lat','lon'] ) support dotted format: 'prop.subprop.title'
			propertyName: 'title', //property in marker.options(or feature.properties for vector layer) trough filter elements in layer,
			moveToLocation: null, //callback run on location found, params: latlng, title, map
			buildTip: null, //function to return row tip html node(or html string), receive text tooltip in first param
			container: '', //container id to insert Search Control		
			zoom: null, //default zoom level for move to location
			minLength: 1, //minimal text length for autocomplete
			initial: true, //search elements only by initial text
			casesensitive: false, //search elements in case sensitive text
			autoType: true, //complete input with first suggested result and select this filled-in text.
			delayType: 400, //delay while typing for show tooltip
			tooltipLimit: -1, //limit max results to show in tooltip. -1 for no limit, 0 for no results
			tipAutoSubmit: true, //auto map panTo when click on tooltip
			firstTipSubmit: false, //auto select first result con enter click
			autoResize: true, //autoresize on input change
			collapsed: true, //collapse search control at startup
			autoCollapse: false, //collapse search control after submit(on button or on tips if enabled tipAutoSubmit)
			autoCollapseTime: 1200, //delay for autoclosing alert and collapse after blur
			textErr: 'Location not found', //error message
			textCancel: 'Cancel', //title in cancel button		
			textPlaceholder: 'Search...', //placeholder value			
			hideMarkerOnCollapse: false, //remove circle and marker on search control collapsed		
			position: 'topleft',
			marker: {//custom L.Marker or false for hide
				icon: false, //custom L.Icon for maker location or false for hide
				circle: {
					radius: 10,
					weight: 3,
					color: '#e03',
					stroke: true,
					fill: false
				}
			}
		},

		_getPath: function (obj, prop) {
			var parts = prop.split('.'),
				last = parts.pop(),
				len = parts.length,
				cur = parts[0],
				i = 1;

			if (len > 0)
				while ((obj = obj[cur]) && i < len)
					cur = parts[i++];

			if (obj)
				return obj[last];
		},

		_isObject: function (obj) {
			return Object.prototype.toString.call(obj) === "[object Object]";
		},

		initialize: function (options) {
			L.Util.setOptions(this, options || {});
			this._inputMinSize = this.options.textPlaceholder ? this.options.textPlaceholder.length : 10;
			this._moveToLocation = this.options.moveToLocation || this._defaultMoveToLocation;
			this._autoTypeTmp = this.options.autoType;	//useful for disable autoType temporarily in delete/backspace keydown
			this._countertips = 0;		//number of tips items
			this._recordsCache = {};	//key,value table! to store locations! format: key,latlng
			this._curReq = null;
		},

		onAdd: function (map) {
			this._map = map;
			this._container = L.DomUtil.create('div', 'leaflet-control-search');
			this._input = this._createInput(this.options.textPlaceholder, 'search-input');
			this._tooltip = this._createTooltip('search-tooltip');
			this._cancel = this._createCancel(this.options.textCancel, 'search-cancel');

			this._button = this._createButton(this.options.textPlaceholder, 'search-button');
			this._alert = this._createAlert('search-alert');

			if (this.options.collapsed === false)
				this.expand(this.options.collapsed);

			if (this.options.marker) {

				if (this.options.marker instanceof L.Marker || this.options.marker instanceof L.CircleMarker)
					this._markerSearch = this.options.marker;

				else if (this._isObject(this.options.marker))
					this._markerSearch = new L.Control.Search.Marker([0, 0], this.options.marker);

				this._markerSearch._isMarkerSearch = true;
			}

			map.on({
				'resize': this._handleAutoresize
			}, this);
			return this._container;
		},
		addTo: function (map) {

			if (this.options.container) {
				this._container = this.onAdd(map);
				this._wrapper = L.DomUtil.get(this.options.container);
				this._wrapper.style.position = 'relative';
				this._wrapper.appendChild(this._container);
			} else
				L.Control.prototype.addTo.call(this, map);

			return this;
		},

		onRemove: function (map) {
			this._recordsCache = {};
			map.off({
				'resize': this._handleAutoresize
			}, this);
		},

		showAlert: function (text) {
			var self = this;
			text = text || this.options.textErr;
			this._alert.style.display = 'block';
			this._alert.innerHTML = text;
			clearTimeout(this.timerAlert);

			this.timerAlert = setTimeout(function () {
				self.hideAlert();
			}, this.options.autoCollapseTime);
			return this;
		},

		hideAlert: function () {
			this._alert.style.display = 'none';
			return this;
		},

		cancel: function () {
			this._input.value = '';
			this._handleKeypress({keyCode: 8});
			this._input.size = this._inputMinSize;
			this._input.focus();
			this._cancel.style.display = 'none';
			this.fire('search:cancel');


			if (this.options.collapsed)
			{
				this._input.style.display = 'none';
				this.list_gemarkungsname.style.display = 'none';
				this.list_fln.style.display = 'none';
				this.list_fsn_zae.style.display = 'none';
				this.list_fsn_nen.style.display = 'none';

				this._cancel.style.display = 'none';
				L.DomUtil.removeClass(this._container, 'search-exp');
				if (this.options.hideMarkerOnCollapse) {
					this._map.removeLayer(this._markerSearch);
				}
				this._map.off('dragstart click', this.collapse, this);
			}
			this.fire('search:collapsed');

			return this;
		},

		expand: function (toggle) {
			toggle = typeof toggle === 'boolean' ? toggle : true;

			this._cancel.style.display = 'block';
			this.list_gemarkungsname.style.display = 'block';

			L.DomUtil.addClass(this._container, 'search-exp');

			this.fire('search:expanded');

			return this;
		},

		collapse: function () {
			this.cancel();
		},

		collapseDelayed: function () {	//collapse after delay, used on_input blur
			var self = this;
			if (!this.options.autoCollapse)
				return this;
			clearTimeout(this.timerCollapse);
			this.timerCollapse = setTimeout(function () {
				self.collapse();
			}, this.options.autoCollapseTime);
			return this;
		},

		collapseDelayedStop: function () {
			clearTimeout(this.timerCollapse);
			return this;
		},

		////start DOM creations
		_createAlert: function (className) {
			var alert = L.DomUtil.create('div', className, this._container);
			alert.style.display = 'none';

			L.DomEvent
				.on(alert, 'click', L.DomEvent.stop, this)
				.on(alert, 'click', this.hideAlert, this);

			return alert;
		},

		_createInput: function (text, className) {

			var self = this;
			var label = L.DomUtil.create('label', className, this._container);

			var list_gemarkungsname = this.list_gemarkungsname = L.DomUtil.create('select', className, this._container);
			list_gemarkungsname.innerHTML = this._gemarkungsnamenFromAjax();
			list_gemarkungsname.id = "gemarkungsname";
			list_gemarkungsname.style.display = 'none';

			var list_fln = this.list_fln = L.DomUtil.create('select', className, this._container);
			list_fln.innerHTML = this._flnFromAjax();
			list_fln.id = "fln";
			list_fln.style.display = 'none';

			var list_fsn_zae = this.list_fsn_zae = L.DomUtil.create('select', className, this._container);
			list_fsn_zae.innerHTML = this._fsn_zaeFromAjax();
			list_fsn_zae.id = "fsn_zae";
			list_fsn_zae.style.display = 'none';

			var list_fsn_nen = this.list_fsn_nen = L.DomUtil.create('select', className, this._container);
			list_fsn_nen.innerHTML = this._fsn_nenFromAjax();
			list_fsn_nen.id = "fsn_nen";
			list_fsn_nen.style.display = 'none';


			var input = L.DomUtil.create('input', className, this._container);
			input.type = 'text';
			input.size = this._inputMinSize;
			input.value = '';
			input.autocomplete = 'off';
			input.autocorrect = 'off';
			input.autocapitalize = 'off';
			input.placeholder = text;
			input.style.display = 'none';
			input.role = 'search';
			input.id = input.role + input.type + input.size;

			label.htmlFor = input.id;
			label.style.display = 'none';
			label.value = text;

			L.DomEvent
				.disableClickPropagation(input)
				.on(input, 'keyup', this._handleKeypress, this)
				.on(input, 'paste', function (e) {
					setTimeout(function (e) {
						self._handleKeypress(e);
					}, 10, e);
				}, this)
				//.on(input, 'blur', this.collapseDelayed, this)
				//.on(input, 'focus', this.collapseDelayedStop, this)
				.on(list_gemarkungsname, 'change', this._setFln, this)
				.on(list_fln, 'change', this._setFsn_zae, this)
				.on(list_fsn_zae, 'change', this._setFsn_nen, this);

			return input;
		},

		_setFln: function (text, className) {
			if (this.list_fln)
			{
				this.list_fln.innerHTML = this._flnFromAjax();
				this.list_fln.style.display = 'block';
			}
			this.list_fsn_nen.style.display = 'none';
			this.list_fsn_zae.style.display = 'none';
		},

		_setFsn_zae: function (text, className) {
			if (this.list_fsn_zae)
			{
				this.list_fsn_zae.innerHTML = this._fsn_zaeFromAjax();
				this.list_fsn_zae.style.display = 'block';
			}
			this.list_fsn_nen.style.display = 'none';
		},

		_setFsn_nen: function (text, className) {
			if (this.list_fsn_nen)
			{
				this.list_fsn_nen.innerHTML = this._fsn_nenFromAjax();
				this.list_fsn_nen.style.display = 'block';
			}
		},

		_createCancel: function (title, className) {
			var cancel = L.DomUtil.create('a', className, this._container);
			cancel.href = '#';
			cancel.title = title;
			cancel.style.display = 'none';
			cancel.innerHTML = "<span>&otimes;</span>";//imageless(see css)

			L.DomEvent
				.on(cancel, 'click', L.DomEvent.stop, this)
				.on(cancel, 'click', this.cancel, this);

			return cancel;
		},

		_createButton: function (title, className) {
			var button = L.DomUtil.create('a', className, this._container);
			button.href = '#';
			button.title = 'jj';

			L.DomEvent
				.on(button, 'click', L.DomEvent.stop, this)
				.on(button, 'click', this._handleSubmit, this)
				.on(button, 'focus', this.collapseDelayedStop, this)
				.on(button, 'blur', this.collapseDelayed, this);

			return button;
		},

		_createTooltip: function (className) {
			var self = this;
			var tool = L.DomUtil.create('ul', className, this._container);
			tool.style.display = 'none';
			L.DomEvent
				.disableClickPropagation(tool)
				.on(tool, 'blur', this.collapseDelayed, this)
				.on(tool, 'mousewheel', function (e) {
					self.collapseDelayedStop();
					L.DomEvent.stopPropagation(e);//disable zoom map
				}, this)
				.on(tool, 'mouseover', function (e) {
					self.collapseDelayedStop();
				}, this);
			return tool;
		},

		_gemarkungsnamenFromAjax: function (text, callAfter) {

			var xhttp_gemarkungsname = new XMLHttpRequest();
			xhttp_gemarkungsname.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
				}
			};
			xhttp_gemarkungsname.open("GET", this.options.url_list_gemarkungsnamen, false);
			xhttp_gemarkungsname.send();

			var json = JSON.parse(xhttp_gemarkungsname.responseText);
			var features = json.features;
			var gemarkungsnamen_as_options = '<option value="' + this.options.placeholder_gemarkungsname + '">' + this.options.placeholder_gemarkungsname + '</option>';
			features.forEach(function (entry) {
				gemarkungsnamen_as_options = gemarkungsnamen_as_options + '<option value="' + entry.properties.gemarkungsname + '">' + entry.properties.gemarkungsname + '</option>'
			});

			return gemarkungsnamen_as_options;
		},

		_castValue: function (value) {

			var castedvalue = value;
			var castedvalue = castedvalue.replace("ä", "_");
			var castedvalue = castedvalue.replace(" ", "_");
			var castedvalue = castedvalue.replace("ü", "_");
			var castedvalue = castedvalue.replace(")", "_");
			var castedvalue = castedvalue.replace("(", "_");
			var castedvalue = castedvalue.replace("-", "_");

			return castedvalue;

		},

		_flnFromAjax: function (text, callAfter) {

			var xhttp_fln = new XMLHttpRequest();
			xhttp_fln.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
				}
			};

			xhttp_fln.open("GET", this.options.url_list_fln + "&viewparams=gemarkungsname:" + this._castValue(this.list_gemarkungsname.value), false);
			xhttp_fln.send();

			var json = JSON.parse(xhttp_fln.responseText);
			var features = json.features;
			var fln_as_options = '<option value="' + this.options.placeholder_fln + '">' + this.options.placeholder_fln + '</option>';
			features.forEach(function (entry) {
				fln_as_options = fln_as_options + '<option value="' + entry.properties.fln + '">' + entry.properties.fln + '</option>'
			});

			return fln_as_options;
		},

		_fsn_zaeFromAjax: function (text, callAfter) {

			var xhttp_fsn_zae = new XMLHttpRequest();
			xhttp_fsn_zae.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
				}
			};
			var url = this.options.url_list_fsn_zae + "&viewparams=gemarkungsname:" + this._castValue(this.list_gemarkungsname.value) + ";fln:" + this._castValue(this.list_fln.value);
			xhttp_fsn_zae.open("GET", url, false);
			xhttp_fsn_zae.send();

			var json = JSON.parse(xhttp_fsn_zae.responseText);
			var features = json.features;
			var fsn_zae_as_options = '<option value="' + this.options.placeholder_fsn_zae + '">' + this.options.placeholder_fsn_zae + '</option>';
			features.forEach(function (entry) {
				fsn_zae_as_options = fsn_zae_as_options + '<option value="' + entry.properties.fsn_zae + '">' + entry.properties.fsn_zae + '</option>'
			});

			return fsn_zae_as_options;
		},

		_fsn_nenFromAjax: function (text, callAfter) {

			var xhttp_fsn_nen = new XMLHttpRequest();
			xhttp_fsn_nen.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
				}
			};
			var url = this.options.url_list_fsn_nen + "&viewparams=gemarkungsname:" + this._castValue(this.list_gemarkungsname.value) + ";fln:" + this._castValue(this.list_fln.value) + ";fsn_zae:" + this._castValue(this.list_fsn_zae.value);
			xhttp_fsn_nen.open("GET", url, false);
			xhttp_fsn_nen.send();

			var json = JSON.parse(xhttp_fsn_nen.responseText);
			var features = json.features;
			var fsn_nen_as_options = '<option value="' + this.options.placeholder_fsn_nen + '">' + this.options.placeholder_fsn_nen + '</option>';
			features.forEach(function (entry) {
				fsn_nen_as_options = fsn_nen_as_options + '<option value="' + entry.properties.fsn_nen + '">' + entry.properties.fsn_nen + '</option>'
			});

			return fsn_nen_as_options;
		},

		_autoType: function () {
			var start = this._input.value.length,
				firstRecord = this._tooltip.firstChild ? this._tooltip.firstChild._text : '',
				end = firstRecord.length;

			if (firstRecord.indexOf(this._input.value) === 0) { 
				this._input.value = firstRecord;
				this._handleAutoresize();

				if (this._input.createTextRange) {
					var selRange = this._input.createTextRange();
					selRange.collapse(true);
					selRange.moveStart('character', start);
					selRange.moveEnd('character', end);
					selRange.select();
				} else if (this._input.setSelectionRange) {
					this._input.setSelectionRange(start, end);
				} else if (this._input.selectionStart) {
					this._input.selectionStart = start;
					this._input.selectionEnd = end;
				}
			}
		},

		_hideAutoType: function () {	// deselect text:

			/*var sel;
			 if ((sel = this._input.selection) && sel.empty) {
			 sel.empty();
			 } else if (this._input.createTextRange) {
			 sel = this._input.createTextRange();
			 sel.collapse(true);
			 var end = this._input.value.length;
			 sel.moveStart('character', end);
			 sel.moveEnd('character', end);
			 sel.select();
			 } else {
			 if (this._input.getSelection) {
			 this._input.getSelection().removeAllRanges();
			 }
			 this._input.selectionStart = this._input.selectionEnd;
			 }*/
			console.log('hideautotype');
		},

		_handleKeypress: function (e) {	//run _input keyup event
			var self = this;
			console.log('keypress');

			switch (e.keyCode)
			{
				case 27://Esc
				case 13://Enter
					console.log("enter");
				/*	if (this._countertips == 1 || (this.options.firstTipSubmit && this._countertips > 0)) {
						if (this._tooltip.currentSelection == -1) {
							this._handleArrowSelect(1);
						}
					}*/
					this._handleSubmit();	//do search
					break;
				case 38://Up
					this._handleArrowSelect(-1);
					break;
				case 40://Down
					this._handleArrowSelect(1);
					break;
				case  8://Backspace
				case 45://Insert
				case 46://Delete
					this._autoTypeTmp = false;//disable temporarily autoType
					break;
				case 37://Left
				case 39://Right
				case 16://Shift
				case 17://Ctrl
				case 35://End
				case 36://Home
					break;
				default://All keys
			}

			this._handleAutoresize();
		},

		_handleAutoresize: function () {
			var maxWidth;

			if (this._input.style.maxWidth !== this._map._container.offsetWidth) {
				maxWidth = this._map._container.clientWidth;

				// other side margin + padding + width border + width search-button + width search-cancel
				maxWidth -= 10 + 20 + 1 + 30 + 22;

				this._input.style.maxWidth = maxWidth.toString() + 'px';
			}

			if (this.options.autoResize && (this._container.offsetWidth + 20 < this._map._container.offsetWidth)) {
				this._input.size = this._input.value.length < this._inputMinSize ? this._inputMinSize : this._input.value.length;
			}
		},

		_handleArrowSelect: function (velocity) {

			var searchTips = this._tooltip.hasChildNodes() ? this._tooltip.childNodes : [];

			for (i = 0; i < searchTips.length; i++)
				L.DomUtil.removeClass(searchTips[i], 'search-tip-select');

			if ((velocity == 1) && (this._tooltip.currentSelection >= (searchTips.length - 1))) {// If at end of list.
				L.DomUtil.addClass(searchTips[this._tooltip.currentSelection], 'search-tip-select');
			} else if ((velocity == -1) && (this._tooltip.currentSelection <= 0)) { // Going back up to the search box.
				this._tooltip.currentSelection = -1;
			} else if (this._tooltip.style.display != 'none') {
				this._tooltip.currentSelection += velocity;

				L.DomUtil.addClass(searchTips[this._tooltip.currentSelection], 'search-tip-select');

				this._input.value = searchTips[this._tooltip.currentSelection]._text;

				// scroll:
				var tipOffsetTop = searchTips[this._tooltip.currentSelection].offsetTop;

				if (tipOffsetTop + searchTips[this._tooltip.currentSelection].clientHeight >= this._tooltip.scrollTop + this._tooltip.clientHeight) {
					this._tooltip.scrollTop = tipOffsetTop - this._tooltip.clientHeight + searchTips[this._tooltip.currentSelection].clientHeight;
				} else if (tipOffsetTop <= this._tooltip.scrollTop) {
					this._tooltip.scrollTop = tipOffsetTop;
				}
			}
		},

		_handleSubmit: function () {

			this._hideAutoType();
			console.log('handelsubmit');

			this.hideAlert();
			//this._hideTooltip();

			if (this._input.style.display == 'none')
			{ //on first click show _input only
				this.expand();
				console.log('_handleSubmit:');
			} else
			{
				var loc = this._getLocation(this._input.value);
				this.showLocation(loc, this._input.value);
				/*				if (this._input.value === '')	//hide _input only
				 this.collapse();
				 else
				 {
				 var loc = this._getLocation(this._input.value);
				 
				 if (loc === false)
				 this.showAlert();
				 else
				 {
				 this.showLocation(loc, this._input.value);
				 this.fire('search:locationfound', {
				 latlng: loc,
				 text: this._input.value,
				 layer: loc.layer ? loc.layer : null
				 });
				 }
				 }*/

			}
		},

		_getLocation: function (key) {	//extract latlng from _recordsCache

			/*if (this._recordsCache.hasOwnProperty(key))
			 return this._recordsCache[key];//then after use .loc attribute
			 else
			 return false;*/
		},

		_defaultMoveToLocation: function (latlng, title, map) {
			if (this.options.zoom)
				this._map.setView(latlng, this.options.zoom);
			else
				this._map.panTo(latlng);
		},

		showLocation: function (latlng, title) {
			var self = this;
			if (self.options.autoCollapse)
				self.collapse();
			/*
			 self._map.once('moveend zoomend', function (e) {
			 
			 if (self._markerSearch) {
			 self._markerSearch.addTo(self._map).setLatLng(latlng);
			 }
			 
			 });
			 
			 self._moveToLocation(latlng, title, self._map);
			 //FIXME autoCollapse option hide self._markerSearch before visualized!!
			 if (self.options.autoCollapse)
			 self.collapse();*/

			return self;
		}
	});

	L.Control.Search.Marker = L.Marker.extend({

		includes: L.version[0] === '1' ? L.Evented.prototype : L.Mixin.Events,

		options: {
			icon: new L.Icon.Default(),
			circle: {
				radius: 10,
				weight: 3,
				color: '#e03',
				stroke: true,
				fill: false
			}
		},

		initialize: function (latlng, options) {
			L.setOptions(this, options);

			if (options.icon === true)
				options.icon = new L.Icon.Default();

			L.Marker.prototype.initialize.call(this, latlng, options);

			if (L.Control.Search.prototype._isObject(this.options.circle))
				this._circleLoc = new L.CircleMarker(latlng, this.options.circle);
		},

		onAdd: function (map) {
			L.Marker.prototype.onAdd.call(this, map);
			if (this._circleLoc) {
				map.addLayer(this._circleLoc);
			}
		},

		onRemove: function (map) {
			L.Marker.prototype.onRemove.call(this, map);
			if (this._circleLoc)
				map.removeLayer(this._circleLoc);
		},

		setLatLng: function (latlng) {
			L.Marker.prototype.setLatLng.call(this, latlng);
			if (this._circleLoc)
				this._circleLoc.setLatLng(latlng);
			return this;
		},

		_initIcon: function () {
			if (this.options.icon)
				L.Marker.prototype._initIcon.call(this);
		},

		_removeIcon: function () {
			if (this.options.icon)
				L.Marker.prototype._removeIcon.call(this);
		},

	});

	L.Map.addInitHook(function () {
		if (this.options.searchControl) {
			this.searchControl = L.control.search(this.options.searchControl);
			this.addControl(this.searchControl);
		}
	});

	L.control.search = function (options) {
		return new L.Control.Search(options);
	};

	return L.Control.Search;

});
