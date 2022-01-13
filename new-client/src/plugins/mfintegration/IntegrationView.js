import React from "react";
import PropTypes from "prop-types";
import { withSnackbar } from "notistack";
import { withStyles } from "@material-ui/core/styles";
import {
  Container,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  ListItem,
  Grid,
} from "@material-ui/core";
import CancelOutlinedIcon from "@material-ui/icons/CancelOutlined";
import ListResult from "./components/ListResult";
import ListToolbar from "./components/ListToolbar";
import EditMenu from "./components/EditMenu";
import { drawingSupportLayers } from "./mockdata/mockdataLayers";

const styles = (theme) => {
  return {
    itemList: {
      maxHeight: 250,
      overflowY: "scroll",
      overflowX: "hidden",
      border: "1px solid rgba(0, 0, 0, .125)",
    },
    dropdown: {
      width: "50%",
    },
    listHeading: {
      fontWeight: theme.typography.fontWeightMedium,
    },
  };
};

const defaultState = {
  mode: "realEstate",
  currentListResults: {
    realEstate: [],
    coordinate: [],
    area: [],
    survey: [],
    contamination: [],
  },
  editTab: "create",
  editMode: "none",
  listToolsMode: "none",
};

const showDevelopmentOnlyButtons = true;

//TODO - Move this out to config.
const informationText =
  "Detta verktyg används för att hantera kartobjekt som har en koppling till verksamhetssystemets poster för exempelvis tillsyn/kontroll och förorenade områden.";

//TODO - move this? where to place constant information on the different modes - the model?
const modeDisplay = {
  realEstate: {
    displayName: "Fastighet",
    displayNamePlural: "Fastigheter",
  },
  coordinate: { displayName: "Koordinat", displayNamePlural: "Koordinater" },
  area: { displayName: "Område", displayNamePlural: "Områden" },
  survey: { displayName: "Underökning", displayNamePlural: "Undersökningar" },
  contamination: {
    displayName: "Förorening",
    displayNamePlural: "Föroreningar",
  },
};

class IntegrationView extends React.PureComponent {
  state = defaultState;

  static propTypes = {
    model: PropTypes.object.isRequired,
    app: PropTypes.object.isRequired,
    classes: PropTypes.object.isRequired,
    localObserver: PropTypes.object.isRequired,
    globalObserver: PropTypes.object.isRequired,
  };

  constructor(props) {
    super(props);

    this.globalObserver = props.globalObserver;
    this.localObserver = props.localObserver;
    this.model = props.model;
    this.app = props.app;
    this.title = props.title;

    this.#init();
    this.#bindSubscriptions();
  }

  #bindSubscriptions = () => {
    this.localObserver.subscribe("window-opened", () => {
      this.#initDrawingSupport();
    });
    this.localObserver.subscribe("mf-wfs-map-updated-features", (props) => {
      this.#updateList(props);
    });
    this.localObserver.subscribe("mf-kubb-message-received", (message) => {
      this.props.enqueueSnackbar(`Inläsning av ${message} från EDP Vision`, {
        variant: "info",
        persist: false,
      });
    });
    this.localObserver.subscribe("mf-start-draw-new-geometry", () => {
      this.newGeometryFunctions[this.state.mode]();
    });
    this.localObserver.subscribe("mf-new-feature-created", (featureSet) => {
      const features = {
        features: featureSet.featureCollection.features,
        isNew: true,
      };
      //feature.isNew = true;
      this.newFeature = features;
      // this.#addNewItemToList(this.newFeature);
      // this.#addNewItemToSource(this.newFeature);
      // this.newFeature = null;
    });
    this.localObserver.subscribe("mf-end-draw-new-geometry", (editMode) => {
      console.log(this.newFeature);
      this.#addNewItemToList(this.newFeature);
      this.#addNewItemToSource(this.newFeature);
      this.newFeature = null;
      const drawType = this.drawTypes[editMode][this.state.mode] + editMode;
      this.drawFunctions[drawType].end();
    });

    this.localObserver.subscribe("mf-edit-supportLayer", (editTarget) => {
      this.#showDrawingSupport(editTarget.layerId);
      this.editFunctions[editTarget.type].start(editTarget.sourceName);
    });
    this.localObserver.subscribe("mf-edit-noSupportLayer", (editTarget) => {
      this.#hideDrawingSupport(editTarget.layerId);
      this.editFunctions[editTarget.type].end(editTarget.sourceName);
    });

    this.localObserver.subscribe(
      "mf-new-feature-added-to-source",
      (feature) => {
        this.newFeature = feature;
      }
    );

    this.globalObserver.subscribe("core.closeWindow", (title) => {
      if (title !== this.title) return;
      this.#clearDrawingSupport();
      this.#clearAllDataSources();
    });
  };

  #init = () => {
    this.drawingSupportLayerNames = drawingSupportLayers();
    this.#initUpdateFunctions();
    this.#initClearFunctions();
    this.#initDrawFunctions();
    this.#initNewGeometryFunctions();
    this.#initEditFunctions();
    this.#initUpdateEditToolsFunctions();
    this.#initDrawTypes();
    this.#initPublishDefaultMode();
  };

  #initUpdateFunctions = () => {
    this.updateListFunctions = {
      realEstate: this.#updateRealEstateList,
      coordinate: this.#updateCoordinateList,
      area: this.#updateAreaList,
      survey: this.#updateSurveyList,
      contamination: this.#updateContaminationList,
    };
  };

  #initClearFunctions = () => {
    this.clearFunctions = {
      realEstate: this.#clearResultsRealEstate,
      coordinate: this.#clearResultsCoordinates,
      area: this.#clearResultsArea,
      survey: this.#clearResultsSurvey,
      contamination: this.#clearResultsContamination,
    };
    this.#addArrayToObject(this.clearFunctions);
  };

  #addArrayToObject = (object) => {
    const array = Object.keys(object).map((key) => {
      return object[key];
    });
    object.array = array;
  };

  #initDrawFunctions = () => {
    this.drawFunctions = {
      pointcopy: {
        start: this.props.model.startDrawCopyPoint,
        end: this.props.model.endDrawCopy,
      },
      pointnew: {
        start: this.props.model.startDrawNewPoint,
        end: this.props.model.endDrawNew,
      },
      polygonnew: {
        start: this.props.model.startDrawNewPolygon,
        end: this.props.model.endDrawNew,
      },
      pointselect: {
        start: this.props.model.startDrawSearchPoint,
        end: this.props.model.endDraw,
      },
      polygonselect: {
        start: this.props.model.startDrawSearchPolygon,
        end: this.props.model.endDraw,
      },
    };
  };

  #initNewGeometryFunctions = () => {
    this.newGeometryFunctions = {
      realEstate: this.drawFunctions.polygonnew.start,
      coordinate: this.drawFunctions.pointnew.start,
      area: this.drawFunctions.polygonnew.start,
      survey: this.drawFunctions.polygonnew.start,
      contamination: this.drawFunctions.polygonnew.start,
    };
  };

  #initEditFunctions = () => {
    this.editFunctions = {
      copy: { start: this.model.startDrawCopyPoint, end: this.model.endDraw },
      snap: {
        start: this.model.addSnapInteraction,
        end: this.model.endSnapInteraction,
      },
    };
  };

  #initUpdateEditToolsFunctions = () => {
    this.updateEditTools = {
      edit: this.#reshapeNewGeometry,
      move: this.#moveNewGeometry,
      delete: this.#deleteNewGeometry,
    };
  };

  #initDrawTypes = () => {
    this.drawTypes = {
      copy: {
        realEstate: "point",
        coordinate: "point",
        area: "point",
        survey: "point",
        contamination: "point",
      },
      new: {
        realEstate: "polygon",
        coordinate: "point",
        area: "polygon",
        survey: "polygon",
        contamination: "polygon",
      },
    };
  };

  #initPublishDefaultMode = () => {
    this.localObserver.publish("mf-new-mode", defaultState.mode);
  };

  #initDrawingSupport = () => {
    this.#showDrawingSupport(this.drawingSupportLayerNames[defaultState.mode]);
  };

  #showDrawingSupport = (layerId) => {
    const drawingSupportLayers = this.#getDrawingSupportLayer(layerId);
    if (drawingSupportLayers.length > 0)
      drawingSupportLayers[0].setVisible(true);
  };

  #hideDrawingSupport = (layerId) => {
    const drawingSupportLayers = this.#getDrawingSupportLayer(layerId);
    if (drawingSupportLayers.length > 0)
      drawingSupportLayers[0].setVisible(false);
  };

  #clearDrawingSupport = () => {
    this.#hideDrawingSupport(this.drawingSupportLayerNames[this.state.mode]);
  };

  #clearAllDataSources = () => {
    for (const clearFunction of this.clearFunctions.array) clearFunction();
    this.props.model.clearHighlight();
  };

  #getDrawingSupportLayer = (layerId) => {
    if (!layerId) return [];
    const layers = this.app.map
      .getLayers()
      .getArray()
      .filter((layer) => layer.get("layerInfo"));
    return layers.filter((layer) => {
      if (layer.getProperties().name === layerId) return layer;
      return false;
    });
  };

  #addNewItemToList = (data) => {
    data.type = this.state.mode;
    this.#updateList(data);
  };

  #addNewItemToSource = (data) => {
    const feature = data?.features[0];
    this.props.model.addFeatureToNewSource(feature, this.state.mode);
  };

  #updateList = (props) => {
    this.updateListFunctions[props.type](props);
  };

  #updateRealEstateList = (props) => {
    //not allowed to add new real estate items.
    let id = -1;
    const realEstateData = props.features.map((feature) => {
      const properties = feature.getProperties();
      return {
        id: ++id,
        fnr: properties[props.propertyName],
        name: properties.fastighet,
        municipality: properties.trakt,
        information: [
          {
            description: "Fastighetsnummer",
            value: properties[props.propertyName],
          },
          { description: "Trakt", value: properties.trakt },
        ],
        visible: true,
        selected: false,
        feature: feature,
      };
    });
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: realEstateData,
      },
    });
  };

  #updateCoordinateList = (props) => {
    let id = -1;
    if (props.isNew) {
      id = this.state.currentListResults.coordinate.length - 1;
    }
    let coordinateData = props.features.map((coordinate) => {
      const properties = coordinate.getProperties();
      const coordinateText =
        "(" +
        coordinate.getGeometry().flatCoordinates[0] +
        "; " +
        coordinate.getGeometry().flatCoordinates[1] +
        ")";
      const name = props.isNew
        ? "Ny koordinat"
        : properties?.label?.length > 0
        ? properties.label
        : coordinateText;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "Label",
            value: properties?.label?.length > 0 ? properties?.label : "-",
          },
          { description: "Koordinat", value: coordinateText },
        ],
        visible: true,
        selected: false,
        feature: coordinate,
        isNew: props.isNew,
      };
    });
    if (props.isNew) {
      let currentData = this.state.currentListResults.coordinate;
      coordinateData.forEach((element) => {
        currentData.unshift(element);
      });
      coordinateData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: coordinateData,
      },
    });
  };

  #updateAreaList = (props) => {
    let id = -1;
    if (props.isNew) {
      id = this.state.currentListResults.area.length - 1;
    }
    let areaData = props.features.map((feature) => {
      debugger;
      const properties = feature?.getProperties();
      const name = props.isNew ? `Nytt område` : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });

    //If we are adding a newly drawn area (not a search), the existing list items should remain.
    if (props.isNew) {
      let currentData = this.state.currentListResults.area;
      areaData.forEach((element) => {
        currentData.unshift(element);
      });
      areaData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        area: areaData,
      },
    });
  };

  #updateSurveyList = (props) => {
    let id = -1;
    if (props.isNew) id = this.state.currentListResults.survey.length - 1;
    let surveyData = props.features.map((feature) => {
      const properties = feature.getProperties();
      const name = props.isNew ? "Ny undersökning" : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });

    if (props.isNew) {
      let currentData = this.state.currentListResults.survey;
      surveyData.forEach((element) => {
        currentData.unshift(element);
      });
      surveyData = currentData;
    }
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        survey: surveyData,
      },
    });
  };

  #updateContaminationList = (props) => {
    let id = -1;
    const contaminationData = props.features.map((feature) => {
      const properties = feature.getProperties();
      const name = props.isNew ? "Ny undersökning" : properties.omrade;
      return {
        id: ++id,
        name: name,
        information: [
          {
            description: "saknas",
            value: properties["saknas"],
          },
        ],
        visible: true,
        selected: false,
        feature: feature,
        isNew: props.isNew,
      };
    });
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        contamination: contaminationData,
      },
    });
  };

  #toggleMode = (mode) => {
    this.#unselectAllFeatures(this.state.mode);
    this.#hideDrawingSupport(this.drawingSupportLayerNames[this.state.mode]);
    this.setState({
      mode: mode,
    });
    this.#showDrawingSupport(this.drawingSupportLayerNames[mode]);
    this.localObserver.publish("mf-new-mode", mode);
  };

  #unselectAllFeatures = (mode) => {
    this.state.currentListResults[mode].map((feature) => {
      feature.selected = false;
      return null;
    });
  };

  #clickRow = (clickedItem, mode) => {
    this.localObserver.publish("mf-item-list-clicked", clickedItem);

    let updateList = { ...this.state.currentListResults };
    let isSelected = !updateList[mode].find(
      (listItem) => listItem.id === clickedItem.id
    ).selected;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === clickedItem.id)
        return { ...listItem, selected: isSelected };
      return { ...listItem, selected: false };
    });

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });
  };

  #removeFromResults = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    const updatedResults = updateList[mode].filter(
      (listItem) => listItem.id !== item.id
    );

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.removeItemFromActiveSource(item);
  };

  #removeCreatedItemFromResults = (item, mode) => {
    console.log("#removeCreatedItemFromResults");
    let updateList = { ...this.state.currentListResults };
    const updatedResults = updateList[mode].filter(
      (listItem) => listItem.id !== item.id
    );

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });
    this.props.model.removeItemFromNewSource(item);
  };

  #clearResults = () => {
    this.clearFunctions[this.state.mode]();
    this.props.model.clearHighlight();
  };

  toggleResultItemVisibility = (item, mode) => {
    let updateList = { ...this.state.currentListResults };
    let shouldBeVisible = !updateList[mode].find(
      (listItem) => listItem.id === item.id
    ).visible;

    const updatedResults = updateList[mode].map((listItem) => {
      if (listItem.id === item.id)
        return { ...listItem, visible: shouldBeVisible };
      return listItem;
    });

    updateList[mode] = updatedResults;
    this.setState({ currentListResults: updateList });

    this.props.model.toggleFeatureStyleVisibility(
      item.feature,
      shouldBeVisible
    );
  };

  #clearResultsRealEstate = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        realEstate: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsCoordinates = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        coordinate: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsArea = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        area: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsSurvey = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        survey: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #clearResultsContamination = () => {
    this.setState({
      currentListResults: {
        ...this.state.currentListResults,
        contamination: [],
      },
    });
    this.props.model.clearResults(this.state.mode);
  };

  #endListToolsMode = (listToolsMode) => {
    this.drawFunctions[listToolsMode]?.end();
  };

  #startListToolsMode = (listToolsMode) => {
    this.drawFunctions[listToolsMode]?.start(this.state.mode);
  };

  #handleUpdateEditTools = (editTool, editMenu) => {
    this.updateEditTools[editTool](editMenu);
  };

  #reshapeNewGeometry = (source) => {};

  #moveNewGeometry = (source) => {};

  #deleteNewGeometry = (source) => {
    this.model.deleteNewGeometry(this.newFeature, source);
  };

  renderEditMenu = () => {
    return (
      <EditMenu
        localObserver={this.localObserver}
        handleUpdateEditToolsMode={this.#handleUpdateEditTools}
      />
    );
  };

  renderListTools = () => {
    return (
      <ListToolbar
        listToolsMode={this.state.listToolsMode}
        handleClearResults={() => {
          this.#clearResults();
        }}
        handleUpdateListToolsMode={(newMode) => {
          this.setState({ listToolsMode: newMode });
        }}
      />
    );
  };

  //TODO - these buttons are temporary, while Kubb data is being mocked by buttons instead of received by SignalR events.
  //These will be removed.
  renderTemporaryDummyButtons = () => {
    return (
      <div>
        {this.state.mode === "realEstate" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testRealEstatesFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa fastigheter
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "coordinate" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testCoordinatesFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa koordinater
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "area" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testAreasFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa områden
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "survey" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testSurveysFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa undersökningar
            </Button>
          </ListItem>
        ) : null}
        {this.state.mode === "contamination" ? (
          <ListItem style={{ paddingLeft: "0px" }}>
            <Button
              startIcon={<CancelOutlinedIcon />}
              onClick={() => {
                this.props.model.testContaminationsFromKUBB();
              }}
              color="primary"
              variant="contained"
            >
              Fejk-KUBB: Testa föroreningar
            </Button>
          </ListItem>
        ) : null}
      </div>
    );
  };

  componentDidUpdate(prevProps, prevState) {
    //keep track of the mode that the list tools are in.
    if (prevState.listToolsMode !== this.state.listToolsMode) {
      let previousMode = prevState.listToolsMode;
      this.#endListToolsMode(previousMode);
      this.#startListToolsMode(this.state.listToolsMode);
    }
  }

  render() {
    const { classes } = this.props;
    const { mode } = this.state;
    return (
      <Container disableGutters>
        <Grid container spacing={(1, 1)}>
          <Grid item xs={12}>
            <Typography>{informationText}</Typography>
          </Grid>
          <Grid item xs={12}>
            <FormControl className={classes.dropdown}>
              <InputLabel htmlFor="modeSelection">Välj kartobjekt</InputLabel>
              <Select
                id="modeSelection"
                value={mode}
                onChange={(e) => {
                  this.#toggleMode(e.target.value);
                }}
              >
                <MenuItem value={"realEstate"}>Fastigheter</MenuItem>
                <MenuItem value={"coordinate"}>Koordinater</MenuItem>
                <MenuItem value={"area"}>Områden</MenuItem>
                <MenuItem value={"survey"}>Undersökningar</MenuItem>
                <MenuItem value={"contamination"}>Föroreningar</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <Typography variant="subtitle1" className={classes.listHeading}>
              {`Markerade ${modeDisplay[mode]["displayNamePlural"]}`}
              {this.state.currentListResults[mode].length > 0
                ? ` (${this.state.currentListResults[mode].length})`
                : null}
            </Typography>
          </Grid>
          {this.renderListTools()}
          <Grid item xs={12}>
            <div>
              {this.state.currentListResults[mode].length > 0 ? (
                <div className={classes.itemList}>
                  {this.state.currentListResults[mode].map((item) => (
                    <ListResult
                      key={item.id}
                      item={item}
                      listMode={mode}
                      handleClickItem={(clickedItem, mode) => {
                        this.#clickRow(clickedItem, mode);
                      }}
                      handleRemoveItem={(item, mode) => {
                        this.#removeFromResults(item, mode);
                      }}
                      handleRemoveCreatedItem={(item, mode) => {
                        this.#removeCreatedItemFromResults(item, mode);
                      }}
                      handleToggleItemVisibilty={(item, mode) => {
                        this.toggleResultItemVisibility(item, mode);
                      }}
                    />
                  ))}
                </div>
              ) : (
                `Inga ${modeDisplay[mode]["displayNamePlural"]} valda.`
              )}
            </div>
          </Grid>
          {showDevelopmentOnlyButtons && (
            <Grid item xs={12}>
              {this.renderTemporaryDummyButtons()}
            </Grid>
          )}
          <Grid container item xs={12} style={{ marginTop: "16px" }}>
            {this.renderEditMenu()}
          </Grid>
        </Grid>
      </Container>
    );
  }
}

export default withStyles(styles)(withSnackbar(IntegrationView));
