// checkbox if sku delay need to be applied
// if false functionality should work as expected
// if true go in metadata for product and check for more delay days
@RestResource(urlMapping='/inquire/*')
global class InquiryService {

   // global static String SLOTS_OPERATING_HOURS_NAME = 'Default Appointment Slots Calendar';
    global static String SLOTS_OPERATING_HOURS_NAME = '7 AM to 7 PM slots';
    global static String API_SCHEDULING_POLICY_NAME = 'Get Available Slots from API Call Policy';

    global static String NO_SLOTS_OPERATING_HOURS_FOUND_ERROR = 'There was an issue finding the ' + SLOTS_OPERATING_HOURS_NAME + ' Operating Hours';
    global static String NO_SERVICE_TERRITORY_FOUND_ERROR = 'There was no Service Territory found for the provided customer zip code';
    global static String NO_SCHEDULING_POLICY_FOUND_ERROR = 'There was an issue finding the correct Scheduling Policy';
    global static String NO_SLOTS_FOUND = 'No availability was found in the Service Territory for the provided customer zip code in the requested date range';

    // public variables to use in different DML methods
    public static String ServiceTerritoryName;
    public static DateTime startDate;
    public static DateTime endDate;
    public static ID serviceTerritoryID;
    public static ID workOrderID;
    public static ID serviceAppointmentID;
    public static String daystobeDelayed;

    @TestVisible 
    private static List<FSL.AppointmentBookingSlot> mockedSlots;
    @TestVisible 
    private static DateTime mockedCurrentTime;

    @HttpPost
    global static InquiryResponse getAppointments() {
        // Lists used in the return
        List<Appointment> appointments = new List<Appointment>();
        List<Error> errorlist = new List<Error>();

        // Set a flag to let the system know we are doing an Inquiry post
        GH_CodeUtils.setFlag('Inquiry Post');

        try {
            InquireRequest inquireRequest = (InquireRequest)JSON.deserialize(RestContext.request.requestBody.toString(), InquireRequest.class);
            
            Date todayDate = Date.Today();
            DateTime dT1 = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime);
            Date startDateInq = date.newinstance(dT1.year(), dT1.month(), dT1.day());
            Integer noOfDays1 = todayDate.daysBetween(startDateInq);
            
         /*   if(noOfDays1 > 30){
                string errMsg = 'ErrorCode:005, ErrorDescription: the requested dates exceed the availability limits';            
                system.assert(false, errMsg);
            }	*/
            SR_Zip_Codes__c zipCode = getSrZipCodeFromZipAndProviderCode(inquireRequest.CustomerLocation.ZipCode, inquireRequest.ProviderCode);
            System.debug('zipCode details: ' +zipCode);
            serviceTerritoryID = zipCode.PS_Service_Territory__c;
            
            //DateTime startDate1 ;
            //DateTime TodaysDate = DateTime.now();
           // boolean hasSkuIdInMetadata = compareSkuIdWithMetadata(inquireRequest.workOrderLines);
            daystobeDelayed = compareSkuDelayWithMetadata(inquireRequest.workOrderLines);
            System.debug('daystobeDelayed>>'+daystobeDelayed);
            ServiceTerritory St = [SELECT Id,Name, Delay_Days__c FROM  ServiceTerritory where Name = :ServiceTerritoryName];
            Integer delayDaysTerritory =Integer.ValueOf(st.Delay_Days__c);
            Boolean isSkudelayApplied = st.SkuDelay__c ; //new field to be Created
            if(isSkudelayApplied){
                 daystobeDelayed = compareSkuDelayWithMetadata(inquireRequest.workOrderLines);
            }
            Integer delayDays = delayDaysTerritory >= daystobeDelayed ? delayDaysTerritory : daystobeDelayed;
            //If payload contains any sku that does not match with the sku's present in metaData
           // if(hasSkuIdInMetadata){
                //If territory consist of delay days and provider code man -- then it will delay the dates
                if(delayDays != null && inquireRequest.ProviderCode == 'MAN'){
                    Date today1 = Date.Today() + delayDays; // 16
                    DateTime dt = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime);
                    Date myDate = date.newinstance(dT.year(), dT.month(), dT.day());
                    Integer noOfDays = today1.daysBetween(myDate);
                    if(noOfDays < 0 ){
                        noOfDays = noOfDays * (-1);
                        startDate = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime) + noOfDays;
                    }
                    else if(noOfDays == 0 ){
                        startDate = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime) + 1  ;
                    }
		            else{
                        startDate = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime)  ;
                    }
                
                }
                else { //No delay days on territory
                        Date today1 = Date.Today() ;
                        DateTime dt = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime);
                        Date myDate = date.newinstance(dT.year(), dT.month(), dT.day());
                        Integer noOfDays = today1.daysBetween(myDate);
                        
                        if(noOfDays <= 0 ){
                            DateTime startTimeWithSystem = DateTime.now();
                            startDate = getDateTimeFromTalendDateTimeString(String.ValueOf(startTimeWithSystem)) + 1  ;
                        }
                        else{
                            startDate = getDateTimeFromTalendDateTimeString(inquireRequest.StartTime)  ;
                        }
                	}
            	
                
    
    
                DateTime endTimeWithSystem = DateTime.now() + 31;
                endDate = endTimeWithSystem;
                if(inquireRequest.EndTime < String.ValueOf(endTimeWithSystem)){
                     endDate = getDateTimeFromTalendDateTimeString(inquireRequest.EndTime);
                }
            	else{
                    endDate = getDateTimeFromTalendDateTimeString(String.ValueOf(endTimeWithSystem));
                }
            	Set<String> skuIdSet = new Set<String>();
            	if(inquireRequest.ProviderCode != null && inquireRequest.ProviderCode == 'MAN'){
                for(WorkOrderLine line : inquireRequest.workOrderLines) {
                    skuIdSet.add(line.SkuId);
                }
                
                List<Product2> prodList = [SELECT Id from Product2 where Client_Code__c ='MAI' AND Client_SKU__c in:skuIdSet];
                
                if(prodList != null && !prodList.isEmpty() && prodList.size() > 0){
                    inquireRequest.ProviderCode = 'MAI';
                }
            }
            

            // Determine the DML method to use for creating the Work Order and the related assets
            if(dmlSetting() == 'Direct') {
                System.debug(LoggingLevel.FINE,'Committing the WO and assets directly');
            
                // populate the Work Order
                WorkOrder wo = InquiryServiceInsert.populateWorkOrder(inquireRequest);
                wo.StartDate = startDate;
                wo.EndDate = endDate;
                wo.ServiceTerritoryId = zipCode.PS_Service_Territory__c;
                
                // Populate the Work Order Line Items
                List<WorkOrderLineItem> woliList = InquiryServiceInsert.populateWOLIList(inquireRequest);
    
                // Populate the Service Appointment Request
                ServiceAppointment sa = InquiryServiceInsert.populateServiceAppointment( startDate, endDate , inquireRequest );
                System.debug('Generated SA: ' +sa);
    
                // do the DML
                Map<String, String> insertResultMap = InquiryServiceInsert.insertWOandAssets(wo, woliList,sa);
    
                // get the results
                workOrderID = insertResultMap.get('WorkOrder');
                serviceAppointmentId = insertResultMap.get('ServiceAppointment');
                
                // check for errors from the insert
                if(insertResultMap.containsKey('Error')) {
                    Error error;
                    error = new Error('005', insertResultMap.get('Error'));
                    errorlist.add(error);
                    throw new InquiryServiceException(insertResultMap.get('Error'));
                }

            } else {
                System.debug(LoggingLevel.FINE,'Committing the WO and assets through HTTP Post');

                // prep for the combined HTTP Post
                List<object> compositeRequests = new List<object>();
        
                // populate the Work Order
                map<String,Object> WorkOrderObject = getBodyWorkOrder(inquireRequest, startDate, endDate, serviceTerritoryID);

                map<String,object> workOrderRequest = new map<String,object>();
                String nameofWOLI =  'test@Mastech'+ String.valueOf(DateTime.now());
                nameofWOLI= nameofWOLI.replaceAll( '\\s+', '');
                workOrderRequest.put('body', WorkOrderObject);
                workOrderRequest.put('referenceId', 'refworkOrder');
                workOrderRequest.put('url', '/services/data/v50.0/sobjects/WorkOrder');
                workOrderRequest.put('method', 'POST');
        
                compositeRequests.add(workOrderRequest);
        
        
                // populate the Work Order Line Items
                map<String,Object> WorkOrderItemObject = getBodyWorkOrderItem(inquireRequest);
                WorkOrderItemObject.put('WorkOrderId', '@{refworkOrder.id}');
                WorkOrderItemObject.put('Work_Order_Line_ID__c', nameofWOLI);
                //WorkOrderItemObject.put('Assigned_Product__c', 'Approval by Manada');
        
                map<String,object> workOrderItemRequest = new map<String,object>();
                workOrderItemRequest.put('body', WorkOrderItemObject);
                workOrderItemRequest.put('referenceId', 'refworkOrderItem');
                workOrderItemRequest.put('url', '/services/data/v50.0/sobjects/WorkOrderLineItem');
                workOrderItemRequest.put('method', 'POST');
        
                //Create Separate Work Order Lines 
                for(Integer i=0; i<inquireRequest.workOrderLines.size(); i++){
                    compositeRequests.add(getBodyWorkOrderItems(inquireRequest,'@{refworkOrder.id}',nameofWOLI,inquireRequest.workOrderLines[i],i));
                }
                
                // create the Service Appointment
                map<String,Object> ServiceAppointmentObj = getBodyServiceAppointment( startDate, endDate , inquireRequest );
                ServiceAppointmentObj.put('ParentRecordId', '@{refworkOrder.id}');
        
                map<String,object> serviceAppointmentRequest = new map<String,object>();
                serviceAppointmentRequest.put('body', ServiceAppointmentObj);
                serviceAppointmentRequest.put('referenceId', 'refserviceAppointment');
                serviceAppointmentRequest.put('url', '/services/data/v50.0/sobjects/ServiceAppointment');
                serviceAppointmentRequest.put('method', 'POST');
        
                compositeRequests.add(serviceAppointmentRequest);
        
                // DML prep for HTTP
                map<String,object> compositeRequestMap = new map<String,object>();
                compositeRequestMap.put('allOrNone', true);
                compositeRequestMap.put('compositeRequest', compositeRequests);
        
                String body = JSON.serialize(compositeRequestMap);
                system.debug('Body is' +JSON.serialize(compositeRequestMap) );

                // perform the DML through a separate method
                Map<String, String> insertResultMap = performCallout(body);
    
                // get the results
                workOrderID = insertResultMap.get('WorkOrder');
                serviceAppointmentId = insertResultMap.get('ServiceAppointment');
                
                // check for errors from the insert
                if(insertResultMap.containsKey('Error')) {
                    Error error;
                    error = new Error('005', insertResultMap.get('Error'));
                    errorlist.add(error);
                    throw new InquiryServiceException(insertResultMap.get('Error'));
                }
            }

            if(workOrderID == null) {
                System.debug(LoggingLevel.ERROR,'DML complete, but the Work Order does not have an ID');
            } else {
                System.debug(LoggingLevel.FINEST,'WorkOrderID: ' +workOrderID);
            }
            if(serviceAppointmentId == null) {
                System.debug(LoggingLevel.ERROR,'DML complete, but the Work Order does not have an ID');
            } else {
                System.debug(LoggingLevel.FINEST,'serviceAppointmentId: ' +serviceAppointmentId);
            }
            
            // Now we get the available slots from the Service Appointment
            System.debug(LoggingLevel.FINEST,'serviceAppointmentId: ' +serviceAppointmentId);

            OperatingHours operatingHours = getOperatingHours(workOrderID);
            System.debug(LoggingLevel.FINEST,'Operating Hours record: ' +operatingHours);

            FSL__Scheduling_Policy__c schedulingPolicy = getSchedulingPolicy();
            System.debug(LoggingLevel.FINEST,'schedulingPolicy record: ' +schedulingPolicy);

            System.TimeZone tz = System.TimeZone.getTimeZone(zipCode.PS_Service_Territory__r.OperatingHours.TimeZone);
            System.debug(LoggingLevel.FINEST,'Timezone record: ' +tz);

            // Use the standard FSL method
            List<FSL.AppointmentBookingSlot> slots = new List<FSL.AppointmentBookingSlot>();
            if(mockedSlots == null) {
                slots = FSL.AppointmentBookingService.GetSlots(
                        serviceAppointmentId,
                        schedulingPolicy.Id,
                        operatingHours,
                        tz,
                        false);
            } else {
                slots = mockedSlots;
            }
            
            // delete the Work Order after we are done
            if( workorderId != null ){
                // Updated by Growth Heroes Sept 2022
                // check the method for delete
                if(deleteSetting() == 'Queueable Async') {
                    // defer deletion to queuable class
                    List<WorkOrder> deleteList = new List<WorkOrder>();
                    deleteList.add(new WorkOrder(Id = workOrderID));
                    ID jobID = System.enqueueJob(new InquiryService_Queue(deleteList));
                    System.debug('Starting Queueable class to delete. The ID for the job is: ' +jobID);
                    
                } else {
                    System.debug('Committing the deletion in real time');
                    WorkOrder tempWorkOrder = new WorkOrder();
                    tempWorkOrder.Id = workOrderID;
                    
                    delete tempWorkOrder;
                }
            }


            // validate the resulting slots
            List<Date> daysToExclude = new List<Date>{Date.today()};
            DateTime currentDateTime = mockedCurrentTime == null ? DateTime.now() : mockedCurrentTime;
            DateTime eightPmInGmtOfLocalTimeZone = getEightPmInGmtOfLocalTimeZone(zipCode.PS_Service_Territory__r.OperatingHours.TimeZone);

            if(currentDateTime > eightPmInGmtOfLocalTimeZone) {
                daysToExclude.add(Date.today().addDays(1));
            }

            for(FSL.AppointmentBookingSlot bookingSlot : slots) {
                if(!daysToExclude.contains(Date.newInstance(bookingSlot.Interval.Start.year(), bookingSlot.Interval.Start.month(), bookingSlot.Interval.Start.Day()))) {
                    appointments.add(new Appointment(bookingSlot));
                }
            }

            //Error message correction
            if(appointments.isEmpty()) {
                Error error;
                error = new Error('005', 'No Slots found.');
                errorlist.add(error);
            }

            InquiryResponse response = new InquiryResponse(appointments, errorlist);
            System.debug(LoggingLevel.FINE, 'Final response: ');
            System.debug(LoggingLevel.FINE, System.JSON.serializePretty(response));
            System.debug('Before Returning Response---->'+Limits.getCpuTime());
            return response;

            
        } catch (InquiryServiceException inquiryServiceException) {
            Error error = new Error('', inquiryServiceException.getMessage());
            errorlist.add(error);
            InquiryResponse response = new InquiryResponse(appointments, errorlist);
            System.debug(LoggingLevel.FINE, 'Error response: ');
            System.debug(LoggingLevel.FINE, System.JSON.serializePretty(response));
            return response;
        }
    }

    // Start & End Dates sent in the request payload will always be a midnight for the desired day
    // so we only need to worry about the date component and convert it into a valid Salesforce DateTime
    private static DateTime getDateTimeFromTalendDateTimeString(String dateTimeString) {
        return DateTime.newInstance(
                Integer.valueOf(dateTimeString.substring(0, 4)), // The year
                Integer.valueOf(dateTimeString.substring(5, 7)), // The month
                Integer.valueOf(dateTimeString.substring(8, 10)), // The day
                Integer.valueOf(dateTimeString.substring(11, 13)), // the hour
                Integer.valueOf(dateTimeString.substring(14, 16)), // the minute
                0
        );
    }

    private static map<String,object> getBodyWorkOrder(InquireRequest inquireRequest, DateTime startDate, DateTime endDate, Id ServiceTerritoryId) {
        map<String,object> workOrderMap = new map<String,object>();
        workOrderMap.put('isGetSlotsWorkOrder__c', true);
        workOrderMap.put('CL_Mobile_Phone__c', '123-456-7890');
        workOrderMap.put('CL_Address_Line_1__c', '123');
        workOrderMap.put('CL_City__c', '123');
        workOrderMap.put('CL_State__c', 'VA');
        workOrderMap.put('Client_Code__c', inquireRequest.ProviderCode);
        workOrderMap.put('CL_Zip_Code_del__c', inquireRequest.CustomerLocation.ZipCode);
        workOrderMap.put('CL_First_Name__c', 'Jane');
        workOrderMap.put('CL_Last_Name__c', 'Doe');
        workOrderMap.put('StartDate', StartDate);
        workOrderMap.put('EndDate', endDate);
        workOrderMap.put('Duration', getDurationFromLines(inquireRequest.workOrderLines));
        workOrderMap.put('Skip_Automation__c', 'Skip');
        workOrderMap.put('ServiceTerritoryId', ServiceTerritoryId);

        return workOrderMap;
    }

    private static map<String,object> getBodyWorkOrderItem(InquireRequest inquireRequest){
        map<String,object> workOrderItemMap = new map<String,object>();
        workOrderItemMap.put('Duration', getDurationFromLines(inquireRequest.workOrderLines));
        workOrderItemMap.put('SKU_Type__c', 'Service');
        workOrderItemMap.put('SKU_Description__c', 'description');
        workOrderItemMap.put('SKU_ID__c', 'askhqhqk123uniqueSKUID');
        
        return workOrderItemMap;
    }
    
    //Create Separate Work Order Lines 
    private static map<string,object> getBodyWorkOrderItems(InquireRequest inquireRequest,String workOrderId , String workOrderLineId,WorkOrderLine line,Integer index){
        map<string,object> requestMap = new map<string,object>();
        requestMap.put('url', '/services/data/v50.0/sobjects/WorkOrderLineItem');
        requestMap.put('method', 'POST');
        map<String,object> workOrderItemMap = new map<String,object>();
        workOrderItemMap.put('WorkOrderId', workOrderId);
        workOrderItemMap.put('Work_Order_Line_ID__c', workOrderLineId);
        workOrderItemMap.put('Duration',line.SkuDuration);
        workOrderItemMap.put('SKU_Type__c',line.SkuType);
        workOrderItemMap.put('SKU_Description__c',line.SkuDescription );
        workOrderItemMap.put('SKU_ID__c', line.SkuId);
        workOrderItemMap.put('Skip_Automation__c', 'Skip');
        requestMap.put('referenceId', 'refworkOrderItem'+index);
        requestMap.put('body',workOrderItemMap);
        return requestMap;
    }

    private static map<String,object> getBodyServiceAppointment(DateTime startDate, DateTime endDate, InquireRequest inquireRequest){
        map<String,object> serviceAppointmentMap = new map<String,object>();
        serviceAppointmentMap.put('isGetSlotsServiceAppointment__c', true);
        serviceAppointmentMap.put('EarliestStartTime', startDate);
        serviceAppointmentMap.put('DueDate', endDate);
		serviceAppointmentMap.put('Duration', getDurationFromLines(inquireRequest.workOrderLines));
		serviceAppointmentMap.put('DurationType', 'Minutes');
        serviceAppointmentMap.put('Skip_Automation__c', 'Skip');
        return serviceAppointmentMap;
    }

    // There are no guarantees of having legitimate Customer Location (CL) fields so the ones required through Validation Rule
    // are populated with dummy values. Zip Code is notably NOT a dummy value as that influences which Service Territory
    // is pulled in. The other field of note is the isGetSlotsWorkOrder which
   @TestVisible
    private static WorkOrder createTemporaryWorkOrder(InquireRequest inquireRequest, DateTime startDate, DateTime endDate, Id ServiceTerritoryId) {
        WorkOrder tempWorkOrder = new WorkOrder();
        tempWorkOrder.isGetSlotsWorkOrder__c = true;
        tempWorkOrder.CL_Mobile_Phone__c = '123-456-7890';
        tempWorkOrder.CL_Address_Line_1__c = '123';
        tempWorkOrder.CL_City__c = '123';
        tempWorkOrder.CL_State__c = 'VA';
        tempWorkOrder.Client_Code__c = 'MAN';
        tempWorkOrder.CL_Zip_Code_del__c = inquireRequest.CustomerLocation.ZipCode;
        tempWorkOrder.CL_First_Name__c = 'Prashank';
        tempWorkOrder.CL_Last_Name__c = 'Doe';
        tempWorkOrder.StartDate = startDate;
        tempWorkOrder.EndDate = endDate;
        tempWorkOrder.Duration = getDurationFromLines(inquireRequest.workOrderLines);
        tempWorkOrder.ServiceTerritoryId = ServiceTerritoryId;
        //tempWorkOrder.AccountId = '0010U000012M0DHQA0';
        return tempWorkOrder;
        
    }
    @TestVisible
    private static WorkOrderLineItem createTemporaryWOLI(WorkOrder wo) {
        WorkOrderLineItem woli = new WorkOrderLineItem(); 
        woli.WorkOrderId = wo.Id;
        woli.Work_Order_Line_ID__c = wo.Subject + '_' + string.valueOf(Datetime.now().millisecondGmt());
        woli.Duration = 20;
        woli.SKU_Type__c = 'Service';
        woli.SKU_Description__c = 'description';
        woli.SKU_ID__c = 'askhqhqk123uniqueSKUID'; 
        return woli; 
    }
    @TestVisible
    private static ServiceAppointment createTemporaryServiceAppointment(DateTime startDate, DateTime endDate, Id workOrderId) {
        ServiceAppointment tempAppointment = new ServiceAppointment();
        tempAppointment.isGetSlotsServiceAppointment__c = true;
        tempAppointment.EarliestStartTime = startDate;
        tempAppointment.DueDate = endDate;
        tempAppointment.ParentRecordId = workOrderId;
        return tempAppointment;
    }

    public static Integer getDurationFromLines(List<WorkOrderLine> workOrderLines) {
        Integer duration = 0;
        for(WorkOrderLine line : workOrderLines) {
            duration += Integer.ValueOf(line.SkuDuration);
        }
        return duration;
    }
    
    private static Boolean compareSkuIdWithMetadata(List<WorkOrderLine> workOrderLines) {
        boolean skuIdPresentInMetadata = false;
        Set<String> skuIdMetadata = new Set<String>();
        
        for(Product_Sku__mdt productSkuRec : [Select MasterLabel from Product_Sku__mdt]){
            skuIdMetadata.add(productSkuRec.MasterLabel);
        }
        //If any of the sku in payload is different from the meta data then make the boolean value true and exit i.e delay will apply
        for(WorkOrderLine line : workOrderLines){
            if(line.SkuType == 'Service'){
                if(!skuIdMetadata.contains(line.SkuId)){
                    skuIdPresentInMetadata = true;
                    break;
                }
            }
        }
        return skuIdPresentInMetadata;
    }
    //new method
     private static Integer compareSkuDelayWithMetadata(List<WorkOrderLine> workOrderLines) {
        boolean skuIdPresentInMetadata = false;
        Integer skuDelayDays ;
        Set<String> skuIdMetadata = new Set<String>();
        Map<String, Integer> SkuIdvsDelayDays = new Map<String, Integer>();
        
        for(Product_Sku__mdt productSkuRec : [Select MasterLabel from Product_Sku__mdt]){
            skuIdMetadata.add(productSkuRec.MasterLabel);
            SkuIdvsDelayDays.put(productSkuRec.MasterLabel, productSkuRec.delaydays__c);
           
        }
        //If any of the sku in payload is different from the meta data then make the boolean value true and exit i.e delay will apply
        for(WorkOrderLine line : workOrderLines){
            if(line.SkuType == 'Service'){
                if(SkuIdvsDelayDays.containsKey(line.SkuId)){
                    if(skuDelayDays.IsNull){
                        skuDelayDays = SkuIdvsDelayDays.get(line.SkuId);
                    }
                    else{
                        if(skuDelayDays < SkuIdvsDelayDays.get(line.SkuId)){
                            skuDelayDays = SkuIdvsDelayDays.get(line.SkuId);
                        }
                    }
                   
                }
            }
        }
        return skuDelayDays;
    }
   

    public static SR_Zip_Codes__c getSrZipCodeFromZipAndProviderCode(String zipCode, String providerCode) {
        List<SR_Zip_Codes__c> zips = [
                SELECT Id, PS_Service_Territory__c,PS_Service_Territory__r.Name, PS_Service_Territory__r.OperatingHoursId, PS_Service_Territory__r.OperatingHours.TimeZone
                FROM SR_Zip_Codes__c
                WHERE Postal_Code__c = :zipCode AND Client_Code__c = :providerCode
                Limit 1
        ];

        if(zips.isEmpty() || zips[0].PS_Service_Territory__c == null) {
            throw new InquiryServiceException(NO_SERVICE_TERRITORY_FOUND_ERROR);
        }
        //Added by Prashank
        else{
            ServiceTerritoryName = zips[0].PS_Service_Territory__r.Name ;
        }

        return zips[0];
    }

    public static OperatingHours getOperatingHours(Id workOrderId) {
        try {
            Id accountId = [SELECT AccountId FROM WorkOrder WHERE Id = :workOrderId].AccountId;

            List<Entitlement> entitlements = [SELECT Id, SvcApptBookingWindowsId FROM Entitlement WHERE AccountId = :accountId];

            if(entitlements.size() > 0 && entitlements[0].SvcApptBookingWindowsId != null) {
                return [SELECT Id, (SELECT EndTime, StartTime, Type, DayOfWeek FROM TimeSlots)
                        FROM OperatingHours
                        WHERE Id = :entitlements[0].SvcApptBookingWindowsId
                        LIMIT 1
                ];
            }

            return [
                    SELECT Id, (SELECT EndTime, StartTime, Type, DayOfWeek FROM TimeSlots)
                    FROM OperatingHours
                    WHERE Name = :SLOTS_OPERATING_HOURS_NAME
                    LIMIT 1
            ];
        } catch (QueryException queryException) {
            throw new InquiryServiceException(NO_SLOTS_OPERATING_HOURS_FOUND_ERROR);
        }
    }
	@TestVisible
    private static FSL__Scheduling_Policy__c getSchedulingPolicy() {
        try { 
            FSL__Scheduling_Policy__c schedulingPolicy = [
                    SELECT Id
                    FROM FSL__Scheduling_Policy__c
                    WHERE Name = :API_SCHEDULING_POLICY_NAME
                    LIMIT 1
            ];

            return schedulingPolicy;
        } catch(QueryException queryException) {
            throw new InquiryServiceException(NO_SCHEDULING_POLICY_FOUND_ERROR);
        }
    }

    @TestVisible
    public static DateTime getEightPmInGmtOfLocalTimeZone(String localTimeZone) {
        Date targetDate = Date.today();
        Time targetTime = Time.newInstance(20, 0, 0, 0); // 8 pm is the cut off for slots for the next day
        Timezone targetTimeZone = TimeZone.getTimeZone(localTimeZone);
        Integer offsetSeconds = targetTimezone.getOffset(targetDate) / 1000;
        return Datetime.newInstanceGmt(targetDate, targetTime).addSeconds(-offsetSeconds);
    }
    
    /**
     * @description - do an HTTP composite post to create the Work Order and related assets
     * @return {Map<String, String>} - Created objects and their IDs (WOLI will be squashed into a single ID)
     * @param body {String} - Body of the HTTP post
     * @example `Map<String, String> insertResultMap = performCallout(body);`
     * The returned map would be something like {'WorkOrder' => [WorkOrder.ID]}
     */
    global static Map<String, String> performCallout(String body) {

        // Map of results with the object as the key
        Map<String, String> returnMap = new Map<String, String>();

        // prep the request
        System.debug('-----body--------'+body);
        HTTPRequest request = new HTTPRequest();
        request.setEndpoint('callout:Salesforce/services/data/v50.0/composite');
        request.setMethod('POST');
        request.setBody(body);
        request.setTimeout(120000);
        request.setHeader('Content-Type', 'application/json');

        //request.setHeader('Authorization', UserInfo.getSessionId());
        // Hitting the API and getting the response
        System.debug('Before Sending Request---->'+Limits.getCpuTime());
        HTTP http = new HTTP();
        HTTPResponse resp = http.send(request);

        System.debug('--response---'+resp);
        System.debug('--body---'+resp.getBody());

        if( resp.getStatusCode() == 200 && resp.getBody() != null ){
            map<String,object> compositeResponseMap = new map<String,object>();
            compositeResponseMap =  (map<String,object>)JSON.deserializeUntyped(resp.getBody());
            System.debug(System.JSON.serializePretty(compositeResponseMap));

            list<object> compositeResponseList = new list<object>();
            //compositeResponseList =  (list<object>)JSON.deserializeUntyped(resp.getBody());
            compositeResponseList = (list<object>)compositeResponseMap.get('compositeResponse');
            
            Id workorderId = null;
            Id serviceAppointmentId = null;

            list<Error> errors = new List<Error>();
            for(object requestObj : compositeResponseList ){
                map<String,object> requestObjMap = new map<String,object>();
                requestObjMap = (map<String,object>)requestObj;
                
                if( requestObjMap != null && requestObjMap.containsKey('httpStatusCode') &&
                    String.valueOf(requestObjMap.get('httpStatusCode')) == '201'){

                    map<String,object> bodyMap = new map<String,object>();
                    bodyMap = (map<String,object>)requestObjMap.get('body');
                    
                    if( bodyMap != null && bodyMap.containsKey('success') && bodyMap.containsKey('id')){
                        Id recordId = (Id)String.valueOf(bodyMap.get('id'));
                        String sObjName = recordId.getSObjectType().getDescribe().getName();
                        if( sObjName != null && sObjName.equalsIgnoreCase('WorkOrder')){
                            workorderId = recordId;
                            returnMap.put('WorkOrder', workorderId);
                        }else if( sObjName != null && sObjName.equalsIgnoreCase('ServiceAppointment') ){
                            serviceAppointmentId = recordId;
                            returnMap.put('ServiceAppointment', serviceAppointmentId);
                        }
                    }
                }else{
                    list<object> bodyList = new list<object>();
                    bodyList = (list<object>)requestObjMap.get('body');
                    for(object bodyObj : bodyList){
                        map<String,object> bodyMap = new map<String,object>();
                        bodyMap = (map<String,object>)bodyObj;
                        if( bodyMap != null && bodyMap.containsKey('errorCode') && string.valueOf(bodyMap.get('errorCode')) != 'PROCESSING_HALTED'){
                            Error error;
                            if(String.valueof(bodyMap.get('errorCode')).contains('FIELD_INTEGRITY_EXCEPTION')){
                                 error = new Error('005', 'No Slots found.');
                            }else{
                                 error = new Error(String.valueof(bodyMap.get('errorCode')), String.valueof(bodyMap.get('message')));
                            }
                            errors.add(error);
                        }
                    }
                }
            }

            System.debug('--errors---'+errors);
            if( errors != null && !errors.isEmpty()){
                //InquiryResponse response = new InquiryResponse(new List<Appointment>(), errors );
                //return response;
                returnMap.put('Error', String.valueOf(errors));
                return returnMap;
            }
        }

        return returnMap;
    }



    /**
     * @description Gets the default value from the Inquiry_Service_Setting Custom Metadata
     */
    @TestVisible
    private static Inquiry_Service_Setting__mdt defaultInquirySetting {
        get {
            if ( defaultInquirySetting == null )
            {
                defaultInquirySetting = Inquiry_Service_Setting__mdt.getInstance('Default');
            }
            return defaultInquirySetting;
        } 
        set; 
    }

    /**
     * @desc - Checks the Inquiry_Service_Setting Custom Metadata to determine WO Deletion method
     * @return {String} - Returns either `Synchronous` or `Queueable Async`, with sync being default if unfound
     */
    @TestVisible
    private static String deleteSetting() {
        if(defaultInquirySetting == null){ return 'Synchronous';}
        return defaultInquirySetting.Async_Delete_Method__c;
    }

    /**
     * @description - Checks the Inquiry_Service_Setting Custom Metadata to determine DML method
     * @return {String} - Returns either `Direct` or `HTTP`, with HTTP being default if unfound
     */
    @TestVisible
    private static String dmlSetting() {
        if(defaultInquirySetting == null){ return 'HTTP';}
        return defaultInquirySetting.DML_Method__c;
    }

    public class InquireRequest {
        public String ProviderCode;
        public String ProviderOrderId;
        public String WorkOrderId;
        public CustomerLocation CustomerLocation;
        public String Redo;
        public String RedoOrderId;
        public StoreLocation ProductLocation;
        public StoreLocation SellingLocation;
        public List<WorkOrderLine> workOrderLines;
        public String EndTime;
        public String ReturnFirstDateAvailable;
        public String StartTime;
        public String AlternativeWorkOrderId;
    }

    public class CustomerLocation {
        public String AddressLine1;
        public String AddressLine2;
        public String City;
        public String CountryCode;
        public String State;
        public String ZipCode;
        public String EmailAddress;
        public String FirstName;
        public String HasChanged;
        public String HomePhone;
        public String LastName;
        public String LocationId;
        public String LocationType;
        public String MobilePhone;
        public String WorkPhone;
    }

    public class StoreLocation {
        public String AddressLine1;
        public String AddressLine2;
        public String City;
        public String CountryCode;
        public String State;
        public String ZipCode;
        public String CompanyName;
        public String Email;
        public String FirstName;
        public String LastName;
        public String LocationId;
        public String LocationType;
        public String PrimaryPhone;
        public String SecondaryPhone;
    }

    public class WorkOrderLine {
        public String ReasonCode;
        public String Status;
        public String WorkOrderLineId;
        public String Height;
        public String Length;
        public String Manufacturer;
        public String ModelNumber;
        public String ProductReturn;
        public String ProductReturnDate;
        public String SkuDescription;
        public String SkuDuration;
        public String SkuId;
        public String SkuType;
        public String Weight;
        public String Width;
    }

    // Object to store the StartTime & EndTime
    global class Appointment {
        public DateTime StartTime {get; set;}
        public DateTime EndTime {get; set;}

        public Appointment(FSL.AppointmentBookingSlot slot) {
            this.StartTime = slot.Interval.Start;
            this.EndTime = slot.Interval.Finish;
        }
    }

    global Class Error {
        public String ErrorCode {get; set;}
        public String ErrorMessage {get; set;}

        public Error(String errorCode, String errorMessage) {
            this.ErrorCode = errorCode;
            this.ErrorMessage = errorMessage;
        }
    }

    global class InquiryResponse {
        public List<Appointment> Appointments {get; set;}
        public List<Error> Errors {get; set;}

        public InquiryResponse(){

        }

        public InquiryResponse(List<Appointment> appointments) {
            this(appointments, new List<Error>());
        }

        public InquiryResponse(List<Appointment> appointments, List<Error> errors) {
            this.Appointments = appointments;
            this.Errors = errors;
        }
    }

    global class InquiryServiceException extends Exception {}
}