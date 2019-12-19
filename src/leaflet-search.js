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
			placeholder_fln: '0',
			placeholder_fsn_zae: 'fsn_zae_',
			placeholder_fsn_nen: 'fsn_nen_',
			url_list_gemarkungsnamen: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:gemarkungsname&propertyName=gemarkungsname&outputFormat=JSON', //
			url_list_fln: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fln&propertyName=fln&outputFormat=JSON', //
			url_list_fsn_zae: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fsn_zae&propertyName=fsn_zae&outputFormat=JSON', //
			url_list_fsn_nen: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?service=WFS&request=GetFeature&version=2.0.0&typeNames=KRE_ALKIS:fsn_nen&propertyName=fsn_nen&outputFormat=JSON', //
			url_list_result: 'http://172.16.206.129:8080/geoserver/KRE_ALKIS/wfs?request=GetFeature&service=WFS&version=2.0.0&outputFormat=JSON',
			propertyName: 'title', //property in marker.options(or feature.properties for vector layer) trough filter elements in layer,
			moveToLocation: null, //callback run on location found, params: latlng, title, map
			container: '', //container id to insert Search Control		
			minLength: 1, //minimal text length for autocomplete
			initial: true, //search elements only by initial text
			delayType: 400, //delay while typing for show tooltip
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

		initialize: function (options) {
			L.Util.setOptions(this, options || {});
		},

		onAdd: function (map) {
			this._map = map;
			this._container = L.DomUtil.create('div', 'leaflet-control-search');
			this._input = this._createInput(this.options.textPlaceholder, 'search-input');
			this._cancel = this._createCancel(this.options.textCancel, 'search-cancel');

			this._button = this._createButton(this.options.textPlaceholder, 'search-button');

			if (this.options.collapsed === false)
				this.expand(this.options.collapsed);

			if (this.options.marker) {

				if (this.options.marker instanceof L.Marker || this.options.marker instanceof L.CircleMarker)
					this._markerSearch = this.options.marker;

				else if (this._isObject(this.options.marker))
					this._markerSearch = new L.Control.Search.Marker([0, 0], this.options.marker);

				this._markerSearch._isMarkerSearch = true;
			}

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
		},

		cancel: function () {
			this._input.value = '';
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
				.on(button, 'click', this._handleSubmit, this);

			return button;
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
			var castedvalue = castedvalue.replace("ß", "_");

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

			// Neede for open on start
			this.expand();

			var features = [];

			var xhttp_loc = new XMLHttpRequest();
			xhttp_loc.onreadystatechange = function () {
				if (this.readyState == 4 && this.status == 200) {
				}
			};

			if (this._castValue(this.list_gemarkungsname.value) == this.options.placeholder_gemarkungsname ||
				this._castValue(this.list_fln.value) == this.options.placeholder_fln ||
				this._castValue(this.list_fsn_zae.value) == this.options.placeholder_fsn_zae
				)
			{
				// console.log('Not all filled in');
			} else if
				(this._castValue(this.list_fsn_nen.value) == this.options.placeholder_fsn_nen)
			{
				var url_result = this.options.url_list_result
					+ "&StoredQuery_ID=gemarkungsname_fln_fsn_zae"
					+ "&gemarkungsname=" + this._castValue(this.list_gemarkungsname.value)
					+ "&fln=" + this._castValue(this.list_fln.value)
					+ "&fsn_zae=" + this._castValue(this.list_fsn_zae.value)
					+ "";
				xhttp_loc.open("GET", url_result, false);
				xhttp_loc.send();

				var json = JSON.parse(xhttp_loc.responseText);
				console.log(json);
				features = json.features;
			} else
			{
				var url_result = this.options.url_list_result
					+ "&StoredQuery_ID=gemarkungsname_fln_fsn_zae_nen"
					+ "&gemarkungsname=" + this._castValue(this.list_gemarkungsname.value)
					+ "&fln=" + this._castValue(this.list_fln.value)
					+ "&fsn_zae=" + this._castValue(this.list_fsn_zae.value)
					+ "&fsn_nen=" + this._castValue(this.list_fsn_nen.value);
				xhttp_loc.open("GET", url_result, false);
				xhttp_loc.send();

				var json = JSON.parse(xhttp_loc.responseText);
				console.log(json);
				features = json.features;

			}
			console.log('clicked');
			console.log(features);
			
			
			var map = this._map;
			features.forEach(function (entry) {
				var latlng = L.latLng(entry.properties.obkx, entry.properties.obky);
				console.log(latlng);
				console.log(this._map);
				
				map.panTo(latlng);

				console.log(entry.properties.gemarkungsname);
				console.log(entry.properties.obkx);
				console.log(entry.properties.obky);
			});

			//this.showLocation(loc, this._input.value);

		},

		_defaultMoveToLocation: function (latlng, title, map) {
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
