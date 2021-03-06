'use strict';
/*

Notes about opportunities

Roles:
------
Membership in a opportunity is defined by the user having various roles attached to their
user record. There are only three possible states: admin, member, or request.
When a user requests membership they get the request role only, once accepted that
simply gets changed to the member role. Roles are simply the opportunity code with suffixes.

member  : <code>
admin   : <code>-admin
request : <code>-request

*/

'use strict';


/**
 * Module dependencies
 */
var path = require('path'),
  mongoose = require('mongoose'),
  Opportunity = mongoose.model('Opportunity'),
  errorHandler = require(path.resolve('./modules/core/server/controllers/errors.server.controller')),
  helpers = require(path.resolve('./modules/core/server/controllers/core.server.helpers')),
  _ = require('lodash')
  ;

// -------------------------------------------------------------------------
//
// set a opportunity role on a user
//
// -------------------------------------------------------------------------
var adminRole = function (opportunity) {
  return opportunity.code+'-admin';
};
var memberRole = function (opportunity) {
  return opportunity.code;
};
var requestRole = function (opportunity) {
  return opportunity.code+'-request';
};
var setOpportunityMember = function (opportunity, user) {
  user.addRoles ([memberRole(opportunity)]);
};
var setOpportunityAdmin = function (opportunity, user) {
  user.addRoles ([memberRole(opportunity), adminRole(opportunity)]);
};
var setOpportunityRequest = function (opportunity, user) {
  user.addRoles ([requestRole(opportunity)]);
};
var unsetOpportunityMember = function (opportunity, user) {
  user.removeRoles ([memberRole(opportunity)]);
};
var unsetOpportunityAdmin = function (opportunity, user) {
  user.removeRoles ([memberRole(opportunity), adminRole(opportunity)]);
};
var unsetOpportunityRequest = function (opportunity, user) {
  console.log ('remove role ', requestRole(opportunity));
  user.removeRoles ([requestRole(opportunity)]);
};
var ensureAdmin = function (opportunity, user, res) {
  if (!~user.roles.indexOf (adminRole(opportunity)) && !~user.roles.indexOf ('admin')) {
    console.log ('NOT admin');
    res.status(422).send({
      message: 'User Not Authorized'
    });
    return false;
  } else {
    console.log ('Is admin');
    return true;
  }
};
// -------------------------------------------------------------------------
//
// this takes a opportunity model, serializes it, and decorates it with what
// relationship the user has to the opportunity, and returns the JSON
//
// -------------------------------------------------------------------------
var decorate = function (opportunityModel, roles) {
  var opportunity = opportunityModel ? opportunityModel.toJSON () : {};
  opportunity.userIs = {
    admin   : !!~roles.indexOf (adminRole(opportunity)) || !!~roles.indexOf ('admin'),
    member  : !!~roles.indexOf (memberRole(opportunity)),
    request : !!~roles.indexOf (requestRole(opportunity)),
    gov     : !!~roles.indexOf ('gov')
  };
  return opportunity;
};
// -------------------------------------------------------------------------
//
// decorate an entire list of opportunities
//
// -------------------------------------------------------------------------
var decorateList = function (opportunityModels, roles) {
  return opportunityModels.map (function (opportunityModel) {
    return decorate (opportunityModel, roles);
  });
};
// -------------------------------------------------------------------------
//
// return a list of all opportunity members. this means all members NOT
// including users who have requested access and are currently waiting
//
// -------------------------------------------------------------------------
exports.members = function (opportunity, cb) {
  mongoose.model ('User').find ({roles: memberRole(opportunity)}).exec (cb);
};

// -------------------------------------------------------------------------
//
// return a list of all users who are currently waiting to be added to the
// opportunity member list
//
// -------------------------------------------------------------------------
exports.requests = function (opportunity, cb) {
  mongoose.model ('User').find ({roles: requestRole(opportunity)}).exec (cb);
};

// -------------------------------------------------------------------------
//
// create a new opportunity. the user doing the creation will be set as the
// administrator
//
// -------------------------------------------------------------------------
exports.create = function (req, res) {
  console.log ('Creating a new opportunity');
  var opportunity = new Opportunity(req.body);
  //
  // set the code, this is used for setting roles and other stuff
  //
  Opportunity.findUniqueCode (opportunity.title, null, function (newcode) {
    opportunity.code = newcode;
    //
    // set the audit fields so we know who did what when
    //
    helpers.applyAudit (opportunity, req.user)
    //
    // save and return
    //
    opportunity.save(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        setOpportunityAdmin (opportunity, req.user);
        req.user.save ();
        res.json(opportunity);
      }
    });
  });
};

// -------------------------------------------------------------------------
//
// this just takes the already queried object and pass it back
//
// -------------------------------------------------------------------------
exports.read = function (req, res) {
  res.json (decorate (req.opportunity, req.user ? req.user.roles : []));
};

// -------------------------------------------------------------------------
//
// update the document, make sure to apply audit. We don't mess with the
// code if they change the title as that would mean reworking all the roles
//
// -------------------------------------------------------------------------
exports.update = function (req, res) {
  if (ensureAdmin (req.opportunity, req.user, res)) {
    //
    // copy over everything passed in. This will overwrite the
    // audit fields, but they get updated in the following step
    //
    var opportunity = _.assign (req.opportunity, req.body);
    //
    // set the audit fields so we know who did what when
    //
    helpers.applyAudit (opportunity, req.user)
    //
    // save
    //
    opportunity.save(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        res.json(opportunity);
      }
    });
  }
};

// -------------------------------------------------------------------------
//
// delete the opportunity
//
// -------------------------------------------------------------------------
exports.delete = function (req, res) {
  console.log ('Deleting');
  if (ensureAdmin (req.opportunity, req.user, res)) {
    console.log ('Deleting');

    var opportunity = req.opportunity;
    opportunity.remove(function (err) {
      if (err) {
        return res.status(422).send({
          message: errorHandler.getErrorMessage(err)
        });
      } else {
        res.json(opportunity);
      }
    });
  }
};

// -------------------------------------------------------------------------
//
// return a list of all opportunities
//
// -------------------------------------------------------------------------
exports.list = function (req, res) {
  Opportunity.find().sort('title')
  .populate('createdBy', 'displayName')
  .populate('updatedBy', 'displayName')
  .exec(function (err, opportunities) {
    if (err) {
      return res.status(422).send({
        message: errorHandler.getErrorMessage(err)
      });
    } else {
      res.json (decorateList (opportunities, req.user ? req.user.roles : []));
      // res.json(opportunities);
    }
  });
};

// -------------------------------------------------------------------------
//
// this is the service front to the members call
//
// -------------------------------------------------------------------------
exports.listMembers = function (req, res) {
  exports.members (req.opportunity, function (err, users) {
    if (err) {
      return res.status (422).send ({
        message: errorHandler.getErrorMessage (err)
      });
    } else {
      res.json (users);
    }
  });
};

// -------------------------------------------------------------------------
//
// this is the service front to the members call
//
// -------------------------------------------------------------------------
exports.listRequests = function (req, res) {
  exports.requests (req.opportunity, function (err, users) {
    if (err) {
      return res.status (422).send ({
        message: errorHandler.getErrorMessage (err)
      });
    } else {
      res.json (users);
    }
  });
};

// -------------------------------------------------------------------------
//
// have the current user request access
//
// -------------------------------------------------------------------------
exports.request = function (req, res) {
  setOpportunityRequest (req.opportunity, req.user);
  req.user.save ();
  res.json ({ok:true});
}

// -------------------------------------------------------------------------
//
// deal with members
//
// -------------------------------------------------------------------------
exports.confirmMember = function (req, res) {
  var user = req.model;
  console.log ('++++ confirm member ', user.username, user._id);
  unsetOpportunityRequest (req.opportunity, user);
  setOpportunityMember (req.opportunity, user);
  user.save (function (err, result) {
    if (err) {
      return res.status (422).send ({
        message: errorHandler.getErrorMessage (err)
      });
    } else {
      console.log ('---- member roles ', result.roles);
      res.json (result);
    }
  });
};
exports.denyMember = function (req, res) {
  var user = req.model;
  console.log ('++++ deny member ', user.username, user._id);
  unsetOpportunityRequest (req.opportunity, user);
  unsetOpportunityMember (req.opportunity, user);
  user.save (function (err, result) {
    if (err) {
      return res.status (422).send ({
        message: errorHandler.getErrorMessage (err)
      });
    } else {
      console.log ('---- member roles ', result.roles);
      res.json (result);
    }
  });
};

// -------------------------------------------------------------------------
//
// new empty opportunity
//
// -------------------------------------------------------------------------
exports.new = function (req, res) {
  console.log ('get a new opportunity set up and return it');
  var p = new Opportunity ();
  res.json(p);
};

// -------------------------------------------------------------------------
//
// magic that populates the opportunity on the request
//
// -------------------------------------------------------------------------
exports.opportunityByID = function (req, res, next, id) {

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).send({
      message: 'Opportunity is invalid'
    });
  }

  Opportunity.findById(id)
  .populate('createdBy', 'displayName')
  .populate('updatedBy', 'displayName')
  .exec(function (err, opportunity) {
    if (err) {
      return next(err);
    } else if (!opportunity) {
      return res.status(404).send({
        message: 'No opportunity with that identifier has been found'
      });
    }
    req.opportunity = opportunity;
    next();
  });
};

