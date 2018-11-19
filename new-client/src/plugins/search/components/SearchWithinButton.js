import React from "react";
import { withStyles } from "@material-ui/core/styles";
import LoupeIcon from "@material-ui/icons/Loupe";
import Button from "@material-ui/core/Button";
import Tooltip from "@material-ui/core/Tooltip";
import Snackbar from "@material-ui/core/Snackbar";

const styles = theme => {
  return {
    button: {
      margin: "4px"
    }
  };
};

class SearchWithinButton extends React.Component {
  state = {
    active: false
  };

  render() {
    const { classes } = this.props;
    return (
      <>
        <Tooltip title="Visa påverkan inom">
          <Button
            className={classes.button}
            variant={this.state.active ? "contained" : "text"}
            onClick={() => {
              this.setState(
                {
                  active: !this.state.active
                },
                () => {
                  this.props.model.toggleDraw(this.state.active, () => {
                    this.setState({
                      active: false
                    });
                  });
                }
              );
            }}
          >
            <LoupeIcon />
            &nbsp; Markera i kartan
          </Button>
        </Tooltip>
        <Snackbar
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          open={this.state.active ? true : false}
          ContentProps={{
            "aria-describedby": "message-id"
          }}
          message={
            <span id="message-id">
              Tryck på den plats i kartan där du vill söka. Dra därefter ut en
              radie för att välja storlek på sökområde.
            </span>
          }
        />
      </>
    );
  }
}

export default withStyles(styles)(SearchWithinButton);
