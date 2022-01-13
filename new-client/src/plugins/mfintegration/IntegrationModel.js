import Draw from "ol/interaction/Draw";
import Feature from "ol/Feature";
import { extend, createEmpty } from "ol/extent";
import Point from "ol/geom/Point";
import Snap from "ol/interaction/Snap";
import { Fill, Stroke, Style, Circle } from "ol/style";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import { KUBB } from "./mockdata/mockdataKUBB";
import Transform from "./Transformation/Transform";
import {
  drawCopyStyle,
  drawNewStyle,
  drawSearchStyle,
  highLightStyle,
  newGeometryStyle,
  newSearchStyle,
  snapStyle,
} from "./mockdata/mockdataStyle";
import { wfsConfig } from "./mockdata/mockdataWFS";

class IntegrationModel {
  constructor(settings) {
    this.map = settings.map;
    this.app = settings.app;
    this.options = settings.options;
    this.localObserver = settings.localObserver;
    this.searchModel = settings.searchModel;

    this.#init();
    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("mf-wfs-search", (data) => {
      this.#handleWfsSearch(data);
    });
    this.localObserver.subscribe("mf-new-mode", (mode) => {
      this.#modeChanged(mode);
    });
    this.localObserver.subscribe("mf-item-list-clicked", (clickedItem) => {
      this.#highlightItem(clickedItem);
    });
  };

  #init = () => {
    this.handleWindowOpen();
    this.#initSearchModelFunctions();
    this.#initSearchResponseFunctions();
    this.#initDrawingFunctions();
    this.#addLayers();
  };

  #initSnap = (mode) => {
    this.snapMode = mode;
    this.map.on("pointermove", this.#snapPointerMove);
  };

  #snapPointerMove = (e) => {
    if (!e.coordinate) return;

    let snapWfsSearch = true;
    this.map.forEachFeatureAtPixel(e.pixel, (snappedGeometry) => {
      const foundFeatureInSource = this.#getFeatureInSource(
        this.activeSnapSource.getFeatures(),
        snappedGeometry,
        wfsConfig()[this.snapMode].geometryField
      );
      if (foundFeatureInSource) snapWfsSearch = false;
      return false;
    });

    if (snapWfsSearch) this.#snapPointWfsSearch(e.coordinate, this.snapMode);
  };

  #snapPointWfsSearch = (coordinates, mode) => {
    const feature = new Feature({ geometry: new Point(coordinates) });
    this.searchModelFunctions[mode](feature);
  };

  #initSearchModelFunctions = () => {
    this.searchModelFunctions = {
      realEstate: this.searchModel.findRealEstatesWithGeometry,
      coordinate: this.searchModel.findCoordinatesWithGeometry,
      area: this.searchModel.findAreasWithGeometry,
      survey: this.searchModel.findSurveysWithGeometry,
      contamination: this.searchModel.findContaminationsWithGeometry,
    };
  };

  #initSearchResponseFunctions = () => {
    this.searchResponseFunctions = {
      copy: this.#copyWfsSearch,
      search: this.#addWfsSearch,
      snap: this.#snapWfsSearch,
    };
  };

  #initDrawingFunctions = () => {
    this.drawingToolFunctions = {
      copy: {
        callback: this.#handleDrawCopyFeatureAdded,
        source: this.#createNewVectorSource(),
      },
      new: {
        callback: this.#handleDrawNewFeatureAdded,
        source: this.#createNewVectorSource(),
      },
      search: {
        callback: this.#handleDrawSearchFeatureAdded,
        source: this.#createNewVectorSource(),
      },
    };
  };

  startDrawCopyPoint = (mode) => {
    this.drawingToolFunctions.copy.source.mode = mode;
    this.#drawGeometry("copy", "Point", drawCopyStyle());
  };

  startDrawNewPoint = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Point", drawNewStyle());
  };

  startDrawNewPolygon = (mode) => {
    this.drawingToolFunctions.new.source.mode = mode;
    this.#drawGeometry("new", "Polygon", drawNewStyle());
  };

  startDrawSearchPoint = (mode) => {
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Point", drawSearchStyle());
  };

  startDrawSearchPolygon = (mode) => {
    this.drawingToolFunctions.search.source.mode = mode;
    this.#drawGeometry("search", "Polygon", drawSearchStyle());
  };

  addSnapInteraction = (mode) => {
    this.searchResponseTool = "snap";
    this.activeSnapSource = this.snapSources[mode];
    this.#initSnap(mode);
    this.snapInteraction = new Snap({ source: this.activeSnapSource });
    this.map.addInteraction(this.snapInteraction);
  };

  endDraw = () => {
    this.map.removeInteraction(this.drawInteraction);
    this.map.clickLock.delete(this.drawingTool);
    this.drawingTool = "none";
  };

  endDrawCopy = () => {
    this.map.clickLock.delete("copy");
    this.endDraw();
  };

  endDrawNew = () => {
    this.map.clickLock.delete("new");
    this.endDraw();
  };

  endSnapInteraction = () => {
    this.searchResponseTool = "snap";
    this.activeSnapSource = null;
    this.map.removeInteraction(this.snapInteraction);
    this.map.un("pointermove", this.#snapPointerMove);
  };

  clearResults = (mode) => {
    this.#clearSource(this.dataSources[mode]);
  };

  clearHighlight = () => {
    this.#clearSource(this.highlightSource);
  };

  removeItemFromActiveSource = (clickedItem) => {
    if (this.#isFeatureHighlighted(clickedItem.feature))
      this.highlightSource.removeFeature(clickedItem.feature);
    this.activeSource.removeFeature(clickedItem.feature);
  };

  removeItemFromNewSource = (clickedItem) => {
    if (this.#isFeatureHighlighted(clickedItem.feature))
      this.highlightSource.removeFeature(clickedItem.feature);
    this.activeNewSource.removeFeature(clickedItem.feature);
  };

  addFeatureToNewSource = (feature, mode) => {
    this.newSources[mode].addFeature(feature);
  };

  toggleFeatureStyleVisibility = (feature, shouldBeVisible) => {
    let featureStyle = new Style();
    if (shouldBeVisible) featureStyle = null;

    this.#setFeatureStyle(feature, featureStyle);
  };

  deleteNewGeometry = (feature, source) => {
    this.editSources[source].removeFeature(feature);
  };

  #clearSource = (source) => {
    source.clear();
  };

  #createNewVectorSource = () => {
    return new VectorSource({ wrapX: false });
  };

  #createNewVectorLayer = (source, style) => {
    return new VectorLayer({
      source: source,
      style: style,
    });
  };

  // TODO: Ev. ta bort denna funktion om admin ger ett sådant här objekt (finns i mockdata)
  #createLayerStyle = (style) => {
    return new Style({
      stroke: new Stroke({
        color: style.stroke.color,
        width: style.stroke.width,
      }),
      fill: new Fill({
        color: style.fill.color,
      }),
      image: new Circle({
        radius: style.circle.radius,
        stroke: new Stroke({
          color: style.stroke.color,
          width: style.circle.width,
        }),
      }),
    });
  };

  #addLayers = () => {
    this.#addSearchLayer();
    this.#addNewGeometryLayer();
    this.#addMapLayers();
    this.#addHighlightLayer();
  };

  #addSearchLayer = () => {
    const searchLayer = this.#createNewVectorLayer(
      this.drawingToolFunctions.search.source,
      this.#createLayerStyle(drawSearchStyle())
    );
    this.map.addLayer(searchLayer);
  };

  #addNewGeometryLayer = () => {
    const newGeometryLayer = this.#createNewVectorLayer(
      this.drawingToolFunctions.new.source,
      this.#createLayerStyle(newGeometryStyle())
    );
    this.map.addLayer(newGeometryLayer);
  };

  #addMapLayers = () => {
    this.#addSources();

    this.#addEditLayers();
    this.#addLayersToMap(this.editLayers.array);

    // TODO: Ta bort fyra rader nedan.
    // Slå på om man behöver visa hur snappningen fungerar
    if (false) {
      this.#addSnapLayers();
      this.#addLayersToMap(this.snapLayers.array);
    }

    this.#addDataLayers();
    this.#addLayersToMap(this.dataLayers.array);
  };

  #addSources = () => {
    this.dataSources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };

    this.editSources = {
      new: this.#createNewVectorSource(),
      copy: this.#createNewVectorSource(),
      combine: this.#createNewVectorSource(),
    };

    this.snapSources = {
      realEstate: this.#createNewVectorSource(),
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };

    this.newSources = {
      coordinate: this.#createNewVectorSource(),
      area: this.#createNewVectorSource(),
      survey: this.#createNewVectorSource(),
      contamination: this.#createNewVectorSource(),
    };
  };

  #addEditLayers = () => {
    this.editLayers = {
      new: this.#createNewVectorLayer(
        this.editSources.new,
        this.#createLayerStyle(newGeometryStyle())
      ),
      copy: this.#createNewVectorLayer(
        this.editSources.copy,
        this.#createLayerStyle(newGeometryStyle())
      ),
      combine: this.#createNewVectorLayer(
        this.editSources.combine,
        this.#createLayerStyle(newGeometryStyle())
      ),
    };
    this.#addArrayToObject(this.editLayers);
  };

  #addSnapLayers = () => {
    this.snapLayers = {
      realEstate: this.#createNewVectorLayer(
        this.snapSources.realEstate,
        this.#createLayerStyle(snapStyle())
      ),
      coordinate: this.#createNewVectorLayer(
        this.snapSources.coordinate,
        this.#createLayerStyle(snapStyle())
      ),
      area: this.#createNewVectorLayer(
        this.snapSources.area,
        this.#createLayerStyle(snapStyle())
      ),
      survey: this.#createNewVectorLayer(
        this.snapSources.survey,
        this.#createLayerStyle(snapStyle())
      ),
      contamination: this.#createNewVectorLayer(
        this.snapSources.contamination,
        this.#createLayerStyle(snapStyle())
      ),
    };
    this.#addArrayToObject(this.snapLayers);
  };

  #addDataLayers = () => {
    this.dataLayers = {
      realEstate: this.#createNewVectorLayer(
        this.dataSources.realEstate,
        this.#createLayerStyle(newSearchStyle())
      ),
      coordinate: this.#createNewVectorLayer(
        this.dataSources.coordinate,
        this.#createLayerStyle(newSearchStyle())
      ),
      area: this.#createNewVectorLayer(
        this.dataSources.area,
        this.#createLayerStyle(newSearchStyle())
      ),
      survey: this.#createNewVectorLayer(
        this.dataSources.survey,
        this.#createLayerStyle(newSearchStyle())
      ),
      contamination: this.#createNewVectorLayer(
        this.dataSources.contamination,
        this.#createLayerStyle(newSearchStyle())
      ),
    };
    this.#addArrayToObject(this.dataLayers);
  };

  #addArrayToObject = (object) => {
    const array = Object.keys(object).map((key) => {
      return object[key];
    });
    object.array = array;
  };

  #addLayersToMap = (layerArray) => {
    for (const layer of layerArray) this.map.addLayer(layer);
  };

  #addHighlightLayer = () => {
    this.highlightSource = this.#createNewVectorSource();

    this.highlightLayer = this.#createNewVectorLayer(
      this.highlightSource,
      this.#createLayerStyle(highLightStyle())
    );
    this.map.addLayer(this.highlightLayer);
  };

  #drawGeometry = (drawingTool, drawType, style) => {
    this.drawingTool = drawingTool;
    const drawFunctionProps = {
      listenerType: "addfeature",
      requestType: drawingTool,
      style: this.#createLayerStyle(style),
      source: this.drawingToolFunctions[drawingTool].source,
      type: drawType,
    };
    this.#createDrawFunction(drawFunctionProps);
  };

  #createDrawFunction = (drawProps) => {
    this.drawInteraction = new Draw({
      source: drawProps.source,
      type: drawProps.type,
      freehand: false,
      stopClick: true,
      style: drawProps.style,
    });
    this.map.clickLock.add(drawProps.requestType);
    this.map.addInteraction(this.drawInteraction);
    this.#addSnapToDrawFunction();
    this.drawingToolFunctions[drawProps.requestType].source.on(
      drawProps.listenerType,
      this.drawingToolFunctions[drawProps.requestType].callback
    );
  };

  #addSnapToDrawFunction = () => {
    if (!this.activeSnapSource) return;
    this.snapInteraction = new Snap({ source: this.activeSnapSource });
    this.map.addInteraction(this.snapInteraction);
  };

  #handleDrawCopyFeatureAdded = (e) => {
    this.#clearSource(this.editSources.copy);
    this.searchResponseTool = "copy";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.new.source);
  };

  #handleDrawNewFeatureAdded = (e) => {
    this.#clearSource(this.editSources.new);
    const data = this.#createDataset(e.feature);
    // TODO: I krav 3.6 kan även snap betyde källa combine
    this.#addAndPublishNewFeature(data, this.editSources.new);

    this.#clearSource(this.drawingToolFunctions.new.source);

    //const data = { features: [e.feature], isNew: true };
    this.localObserver.publish("mf-new-feature-created", data);
  };

  #createDataset = (feature) => {
    let pairs = [];
    for (let i = 0; i < feature.getGeometry().flatCoordinates.length; i += 2) {
      pairs.push([
        feature.getGeometry().flatCoordinates[i],
        feature.getGeometry().flatCoordinates[i + 1],
      ]);
    }
    const coordinates = [pairs];
    const features = [
      {
        geometry: {
          type: "Polygon",
          coordinates: coordinates,
        },
        id: "område.0",
        geometry_name: null,
        properties: { saknas: "-" },
        type: "Feature",
      },
    ];
    const geom = new Transform().createGeometry("Polygon", coordinates);
    let newFeature = new Feature({
      geometry: geom,
    });
    newFeature.setProperties(features[0].properties);
    const simulatedFeatureCollection = { features: [newFeature] };
    return {
      searchType: "none",
      geometryField: null,
      featureCollection: simulatedFeatureCollection,
      transformation: null,
    };
  };

  #handleDrawSearchFeatureAdded = (e) => {
    this.searchResponseTool = "search";
    this.searchModelFunctions[e.target.mode](e.feature);
    this.#clearSource(this.drawingToolFunctions.search.source);
  };

  #setFeatureStyle = (feature, style) => {
    feature.setStyle(style);
  };

  #handleWfsSearch = (data) => {
    this.searchResponseFunctions[this.searchResponseTool](data);
  };

  #addWfsSearch = (data) => {
    this.#addFeaturesToSource(this.dataSources[data.type], data);
    this.#updateList(this.dataSources[data.type], data);
    this.#zoomToSource(this.dataSources[data.type]);
  };

  #addFeaturesToSource = (source, featureCollection) => {
    const features = this.#createFeaturesFromFeatureCollection(
      featureCollection.searchType,
      featureCollection.featureCollection,
      featureCollection.transformation
    );
    this.#clearOldSearch(source, featureCollection);
    if (features.noFeaturesFound) return;
    if (features.addOrRemoveFeature) {
      this.#handlePointClickOnLayer(
        source,
        features,
        featureCollection.geometryField
      );
      return;
    }
    this.#addNoDuplicatesToSource(
      features,
      source,
      featureCollection.geometryField
    );
  };

  #clearOldSearch = (source, featureCollection) => {
    if (featureCollection.searchType === "List") this.#clearSource(source);
  };

  #handlePointClickOnLayer = (source, featureCollection, comparePropertyId) => {
    const clickedFeature = featureCollection.features[0];
    const foundFeatureInSource = this.#getFeatureInSource(
      source.getFeatures(),
      clickedFeature,
      comparePropertyId
    );
    if (foundFeatureInSource) source.removeFeature(foundFeatureInSource);
    else source.addFeature(clickedFeature);
  };

  #addNoDuplicatesToSource = (featureSet, source, comparePropertyId) => {
    const featuresInSource = source.getFeatures();
    if (featuresInSource.length === 0) {
      source.addFeatures(featureSet.features);
      return;
    }

    const featuresToAddToSource = featureSet.features.filter((feature) => {
      if (
        !this.#getFeatureInSource(featuresInSource, feature, comparePropertyId)
      )
        return feature;
      return false;
    });

    source.addFeatures(featuresToAddToSource);
  };

  #getFeatureInSource = (
    featuresInSource,
    clickedFeature,
    comparePropertyId
  ) => {
    const featuresFoundInSource = featuresInSource.filter((feature) => {
      if (
        feature.getProperties()[comparePropertyId] ===
        clickedFeature.getProperties()[comparePropertyId]
      )
        return feature;
      return false;
    });

    if (featuresFoundInSource.length === 0) return null;
    return featuresFoundInSource[0];
  };

  #createFeaturesFromFeatureCollection = (
    selectionGeometryType,
    featureCollection,
    transformation
  ) => {
    console.log("#createFeaturesFromFeatureCollection");
    debugger;
    if (featureCollection.features.length === 0)
      return { noFeaturesFound: true };
    const features = featureCollection.features.map((feature) => {
      //debugger;
      let geometry = new Transform().createGeometry(
        feature.geometry.type,
        feature.geometry.coordinates
      );
      if (transformation)
        geometry = new Transform().transformGeometry(
          geometry.clone(),
          transformation.fromSrs,
          transformation.toSrs
        );
      let newFeature = new Feature({
        geometry: geometry,
      });
      newFeature.setProperties(feature.properties);
      return newFeature;
    });

    const pointClick = selectionGeometryType === "Point";
    return { features: features, addOrRemoveFeature: pointClick };
  };

  #updateList = (source, data) => {
    const featuresAndGeometryProperyName = {
      features: source.getFeatures(),
      propertyName: data.geometryField,
      type: data.type,
    };
    this.localObserver.publish(
      "mf-wfs-map-updated-features",
      featuresAndGeometryProperyName
    );
  };

  #zoomToSource = (source) => {
    const featuresInSource = source.getFeatures();
    if (featuresInSource.length === 0) return;

    let extent = createEmpty();
    featuresInSource.forEach((feature) => {
      extend(extent, feature.getGeometry().getExtent());
    });
    this.map.getView().fit(extent, {
      size: this.map.getSize(),
      padding: [100, 100, 100, 100],
      maxZoom: 12,
    });
  };

  #copyWfsSearch = (data) => {
    this.#addAndPublishNewFeature(data, this.editSources.copy);
  };

  #addAndPublishNewFeature = (data, source) => {
    const previousFeatures = source.getFeatures();
    this.#addFeaturesToSource(source, data);
    const presentFeatures = source.getFeatures();

    const newFeature = presentFeatures.filter((feature) => {
      return previousFeatures.indexOf(feature) === -1;
    });
    this.localObserver.publish("mf-new-feature-added-to-source", newFeature[0]);
  };

  #snapWfsSearch = (data) => {
    const features = this.#createFeaturesFromFeatureCollection(
      data.searchType,
      data.featureCollection,
      data.transformation
    );
    this.#addNoDuplicatesToSource(
      features,
      this.activeSnapSource,
      data.geometryField
    );
  };

  #modeChanged = (mode) => {
    this.#clearSource(this.highlightSource);
    this.#hideAllLayers();
    this.#showAcitveLayer(mode);
    this.#setActiveSource(mode);
    this.#setActiveNewSource(mode);
  };

  #hideAllLayers = () => {
    for (const layer of this.dataLayers.array) layer.setVisible(false);
  };

  #showAcitveLayer = (mode) => {
    this.dataLayers[mode].setVisible(true);
  };

  #setActiveSource = (mode) => {
    this.activeSource = this.dataSources[mode];
  };

  #setActiveNewSource = (mode) => {
    this.activeNewSource = this.newSources[mode];
  };

  #highlightItem = (item) => {
    const addItem = !this.#isFeatureHighlighted(item.feature);
    this.#clearSource(this.highlightSource);

    if (addItem) {
      this.highlightSource.addFeature(item.feature);
      this.#zoomToSource(this.highlightSource);
      return;
    }

    this.#zoomToSource(this.activeSource);
  };

  #isFeatureHighlighted = (feature) => {
    return this.highlightSource.getFeatures()[0] === feature;
  };

  handleWindowOpen = () => {
    this.localObserver.publish("window-opened");
  };

  #sendSnackbarMessage = (nativMessageType) => {
    //TODO - when Kubb is properly connected, we will do some kind of parsing of the message, to find out the type.
    //as it is not the message, is a basic mock.
    this.localObserver.publish("mf-kubb-message-received", nativMessageType);
  };

  testRealEstatesFromKUBB = () => {
    this.#sendSnackbarMessage("fastighter");
    const FNRs = KUBB().realEstates;
    this.searchResponseTool = "search";
    this.searchModel.findRealEstatesWithNumbers(FNRs);
  };

  testCoordinatesFromKUBB = () => {
    this.#sendSnackbarMessage("koordinater");
    const coordinates = KUBB().coordinates;
    this.searchResponseTool = "search";
    this.searchModel.findCoordinatesWithCoordinates(coordinates);
  };

  testAreasFromKUBB = () => {
    this.#sendSnackbarMessage("områden");
    this.searchResponseTool = "search";
    this.searchModel.findAreasWithNumbers({
      coordinates: KUBB().areas.coordinates,
      name: KUBB().areas.name,
    });
  };

  testSurveysFromKUBB = () => {
    this.#sendSnackbarMessage("undersökningar");
    const surveys = KUBB().surveys;
    this.searchResponseTool = "search";
    this.searchModel.findSurveysWithNumbers(surveys);
  };

  testContaminationsFromKUBB = () => {
    this.#sendSnackbarMessage("föroreningar");
    const contaminations = KUBB().contaminations;
    this.searchResponseTool = "search";
    this.searchModel.findContaminationsWithNumbers(contaminations);
  };
}

export default IntegrationModel;
